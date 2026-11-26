#!/usr/bin/env bash
# Instalación (idempotente) de crm-relay en el servidor. Ejecutar como root, con el repo ya clonado en /opt/apps/crm-relay:
#   cd /opt/apps/crm-relay && bash deploy/server-setup.sh
# Instala: .env con secretos generados, vhosts de nginx + TLS (certbot), cron de deploy automático y backup diario de la BD.
set -euo pipefail

DIR=/opt/apps/crm-relay
WEB_DOMAIN=relay.exmachina.systems
API_DOMAIN=relay-api.exmachina.systems
cd "$DIR"

# 1) .env (los secretos de producción se generan aquí y no salen del servidor; las claves externas las carga el equipo)
if [ ! -f .env ]; then
  (umask 077; cat > .env <<ENV
POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 32)
DATA_KEY=$(openssl rand -hex 32)
WEB_ORIGIN=https://$WEB_DOMAIN
API_ORIGIN=https://$API_DOMAIN
PUBLIC_ORIGIN=https://$WEB_DOMAIN
WEB_PORT=3103
API_PORT=3104
AGENT_TIMEZONE=America/Caracas
# A completar por el equipo (sin ellos el agente no responde y el webhook de Meta rechaza mensajes):
ANTHROPIC_API_KEY=
META_APP_SECRET=
ENV
  )
  echo ".env creado con secretos nuevos"
fi

# 2) Base de datos propia en el PostgreSQL del host (rol/base crm_relay, acceso por socket)
bash deploy/db-setup.sh

# 2b) Script de deploy + cron cada 5 min
install -m 0755 deploy/deploy.sh /usr/local/bin/deploy-crm-relay.sh
CRON_DEPLOY='*/5 * * * * /usr/local/bin/deploy-crm-relay.sh'

# 3) Backup diario de PostgreSQL (14 días)
cat > /usr/local/bin/backup-crm-relay.sh <<'BK'
#!/usr/bin/env bash
set -euo pipefail
D=/opt/apps/crm-relay; mkdir -p "$D/backups"; chmod 700 "$D/backups"
cd "$D"
set -a; . "$D/.env"; set +a
PGPASSWORD="$CRM_DB_PASSWORD" pg_dump -h /var/run/postgresql -U "${CRM_DB_USER:-crm_relay}" "${CRM_DB_NAME:-crm_relay}" | gzip > "$D/backups/crm_$(date +%F).sql.gz"
# Imágenes del catálogo: copia espejo del bucket de MinIO (con las credenciales limitadas del CRM) o, si no hay MinIO, del volumen local
if [ -n "${MINIO_ENDPOINT:-}" ]; then
  mkdir -p "$D/backups/relay-media"
  docker run --rm --user "$(id -u):$(id -g)" --network "${WIKI_NETWORK:-exmachina-wiki_default}" -e "MC_HOST_a=http://$MINIO_ACCESS_KEY:$MINIO_SECRET_KEY@$MINIO_ENDPOINT:${MINIO_PORT:-9000}" -v "$D/backups/relay-media":/dest cgr.dev/chainguard/minio-client:latest mirror --overwrite --remove "a/${MINIO_BUCKET:-relay-media}" /dest | tail -1
else
  docker run --rm -v crm-relay_uploads:/data:ro -v "$D/backups":/b node:22-alpine tar czf "/b/uploads_$(date +%F).tgz" -C /data .
fi
find "$D/backups" \( -name 'crm_*.sql.gz' -o -name 'uploads_*.tgz' \) -mtime +14 -delete
BK
chmod 0755 /usr/local/bin/backup-crm-relay.sh
CRON_BACKUP='30 3 * * * /usr/local/bin/backup-crm-relay.sh >>/var/log/backup-crm-relay.log 2>&1'

( crontab -l 2>/dev/null | grep -v -e deploy-crm-relay.sh -e backup-crm-relay.sh || true; echo "$CRON_DEPLOY"; echo "$CRON_BACKUP" ) | crontab -
touch /var/log/deploy-crm-relay.log

# 4) nginx (host) + TLS
for d in "$WEB_DOMAIN" "$API_DOMAIN"; do
  [ -f "/etc/nginx/sites-enabled/$d" ] || install -m 0644 "deploy/nginx/$d.conf" "/etc/nginx/sites-enabled/$d"
done
nginx -t && systemctl reload nginx
certbot --nginx --non-interactive --agree-tos --redirect -d "$WEB_DOMAIN" -d "$API_DOMAIN" --cert-name "$WEB_DOMAIN"
nginx -t && systemctl reload nginx
echo "Listo. Primer deploy: /usr/local/bin/deploy-crm-relay.sh && tail -n 20 /var/log/deploy-crm-relay.log"
