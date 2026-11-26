# Despliegue (servidor con nginx + Docker)

Dominios: `relay.exmachina.systems` (frontend, y `/api` hacia el backend) y `relay-api.exmachina.systems` (API y webhook de WhatsApp).

- `docker-compose.prod.yml` (raíz): usa el **PostgreSQL del host** en su propia base `crm_relay` (por socket Unix, sin abrir puertos); frontend en `127.0.0.1:3103`, backend en `127.0.0.1:3104`.
- `deploy/db-setup.sh`: crea el rol y la base `crm_relay` (sin acceso para PUBLIC), añade la regla en `pg_hba.conf` solo para ese rol (con `reload`, sin reiniciar) y guarda las credenciales en `.env`. Idempotente.
- `deploy/deploy.sh`: deploy automático. Cron cada 5 min; solo reconstruye si `origin/main` cambió; si el build falla,
  deja lo que está corriendo y no reintenta ese commit durante 30 min. Log: `/var/log/deploy-crm-relay.log`.
- `deploy/server-setup.sh`: instalación idempotente (`.env` con secretos generados, vhosts, certbot, cron de deploy, backup diario de la BD en `/opt/apps/crm-relay/backups`, 14 días).
- `deploy/nginx/*.conf`: vhosts del host (certbot añade el TLS).

Primera vez: clonar el repo en `/opt/apps/crm-relay`, `bash deploy/server-setup.sh` y completar en `.env`:
`ANTHROPIC_API_KEY` (el agente no responde sin ella) y `META_APP_SECRET` (en producción el backend rechaza los webhooks de Meta sin firma).
Webhook de Meta: `https://relay-api.exmachina.systems/whatsapp/webhook` (el token de verificación sale en la pantalla WhatsApp).

Restaurar un backup: `set -a; . ./.env; set +a; gunzip -c backups/crm_AAAA-MM-DD.sql.gz | PGPASSWORD=$CRM_DB_PASSWORD psql -h /var/run/postgresql -U crm_relay crm_relay`.

## Imágenes del catálogo en MinIO
El backend guarda las imágenes en MinIO si hay `MINIO_ENDPOINT` en el `.env`; si no, usa el volumen local `uploads`.
Usa el MinIO de la wiki (red `exmachina-wiki_default`, host `minio:9000`) con un **bucket y un usuario propios**:
`bash deploy/minio-setup.sh` (lo ejecuta quien administra ese MinIO: crea el bucket `relay-media`, el usuario `relay-app` limitado a ese bucket
y escribe `MINIO_*` en el `.env`). Después del despliegue, migrar lo que había en el volumen: `docker compose -p crm-relay -f docker-compose.yml -f docker-compose.prod.yml exec backend node dist/media/migrate.js`.
El volumen `uploads` se conserva como respaldo hasta confirmar que todo se sirve desde MinIO.
