#!/usr/bin/env bash
# Inicializa MinIO de CotizAI (idempotente): bucket privado + usuario de la API con permisos SOLO sobre ese bucket.
# La API nunca usa las credenciales root. Uso: infra/minio-init.sh   (tras `docker compose ... up -d minio`)
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env; set +a
: "${MINIO_ROOT_USER:?}" "${MINIO_ROOT_PASSWORD:?}" "${MINIO_APP_USER:?}" "${MINIO_APP_PASSWORD:?}" "${MINIO_BUCKET:?}"

NET="${COMPOSE_NETWORK:-evaluador_interna}"
MC_IMG="cgr.dev/chainguard/minio-client:latest"
# mc lee el alias de MC_HOST_local: no se escribe ningún archivo de configuración con las claves.
mc() { docker run --rm -i --network "$NET" -e "MC_HOST_local=http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@minio:9000" "$MC_IMG" "$@"; }

echo "Esperando a MinIO…"
for i in $(seq 1 30); do mc ready local >/dev/null 2>&1 && break; sleep 2; [ "$i" = 30 ] && { echo "MinIO no responde"; exit 1; }; done

mc mb --ignore-existing "local/${MINIO_BUCKET}"
mc anonymous set none "local/${MINIO_BUCKET}"          # bucket privado: sin acceso anónimo

POLICY="$(cat <<JSON
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],"Resource":["arn:aws:s3:::${MINIO_BUCKET}/*"]},
 {"Effect":"Allow","Action":["s3:ListBucket","s3:GetBucketLocation"],"Resource":["arn:aws:s3:::${MINIO_BUCKET}"]}]}
JSON
)"
# La política viaja por stdin al contenedor: no queda archivo en disco.
echo "$POLICY" | docker run --rm -i --network "$NET" -e "MC_HOST_local=http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@minio:9000" "$MC_IMG" admin policy create local cotizai-app /dev/stdin 2>&1 | grep -v -i "already" || true

mc admin user add local "$MINIO_APP_USER" "$MINIO_APP_PASSWORD" >/dev/null 2>&1 || true   # idempotente
mc admin policy attach local cotizai-app --user "$MINIO_APP_USER" >/dev/null 2>&1 || true
echo "Listo: bucket '${MINIO_BUCKET}' privado y usuario '${MINIO_APP_USER}' con acceso solo a ese bucket."
