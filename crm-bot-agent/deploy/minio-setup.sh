#!/usr/bin/env bash
# Prepara (idempotente) el uso del MinIO que ya corre en el servidor (el de la wiki) por el CRM, con bucket y
# credenciales PROPIOS:
#   - bucket privado "relay-media"
#   - usuario "relay-app" con una política que solo permite ese bucket (no ve el bucket de la wiki)
#   - las credenciales raíz solo se usan dentro de un contenedor temporal de `mc`: no se imprimen ni se guardan
#   - las credenciales de relay-app se generan aquí y se guardan en /opt/apps/crm-relay/.env
# REQUIERE que alguien con autoridad sobre ese MinIO lo ejecute (usa sus credenciales raíz para crear el usuario).
# Ejecutar como root en el servidor:  bash deploy/minio-setup.sh
set -euo pipefail

ENVF=/opt/apps/crm-relay/.env
CTR=${MINIO_CONTAINER:-exmachina-wiki-minio-1}
BUCKET=relay-media; APPUSER=relay-app; POLICY=relay-media-rw
MC_IMAGE=${MC_IMAGE:-cgr.dev/chainguard/minio-client:latest}
[ -f "$ENVF" ] || { echo "Falta $ENVF"; exit 1; }

NET=$(docker inspect "$CTR" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')
envof() { docker inspect "$CTR" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n "s/^$1=//p"; }
ROOT_USER=$(envof MINIO_ROOT_USER); ROOT_PASS=$(envof MINIO_ROOT_PASSWORD)
[ -n "$ROOT_USER" ] && [ -n "$ROOT_PASS" ] || { echo "No se pudieron leer las credenciales de $CTR"; exit 1; }

grep -q '^MINIO_SECRET_KEY=' "$ENVF" || echo "MINIO_SECRET_KEY=$(openssl rand -hex 24)" >> "$ENVF"
for kv in MINIO_ENDPOINT=minio MINIO_PORT=9000 MINIO_USE_SSL=false MINIO_BUCKET=$BUCKET MINIO_ACCESS_KEY=$APPUSER WIKI_NETWORK=$NET; do grep -q "^${kv%%=*}=" "$ENVF" || echo "$kv" >> "$ENVF"; done
APP_SECRET=$(sed -n 's/^MINIO_SECRET_KEY=//p' "$ENVF")

POL=$(mktemp); trap 'rm -f "$POL"' EXIT
cat > "$POL" <<JSON
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],"Resource":["arn:aws:s3:::$BUCKET/*"]},
 {"Effect":"Allow","Action":["s3:ListBucket","s3:GetBucketLocation"],"Resource":["arn:aws:s3:::$BUCKET"]}]}
JSON
chmod 644 "$POL"

mc() { docker run --rm --network "$NET" -e "MC_HOST_m=http://$ROOT_USER:$ROOT_PASS@minio:9000" -v "$POL":/policy.json:ro "$MC_IMAGE" "$@"; }
mc mb --ignore-existing "m/$BUCKET"
mc admin policy create m "$POLICY" /policy.json
mc admin user add m "$APPUSER" "$APP_SECRET"
mc admin policy attach m "$POLICY" --user "$APPUSER" || true

# Comprobación con las credenciales limitadas: el bucket propio funciona y el de la wiki queda fuera de alcance
app() { docker run --rm --network "$NET" -e "MC_HOST_a=http://$APPUSER:$APP_SECRET@minio:9000" "$MC_IMAGE" "$@"; }
app ls "a/$BUCKET" >/dev/null && echo "OK: relay-app accede a $BUCKET"
if app ls a/wiki >/dev/null 2>&1; then echo "ERROR: relay-app puede ver el bucket de la wiki"; exit 1; else echo "OK: relay-app NO puede acceder al bucket de la wiki"; fi
