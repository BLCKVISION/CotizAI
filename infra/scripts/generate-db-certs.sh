#!/usr/bin/env bash
# Creates a private certificate authority and a certificate for the database service, used by compose.db-tls.yml.
# Existing certificates are never overwritten. The authority's key is only needed to issue the server certificate.
set -euo pipefail

CERTS="$(cd "$(dirname "$0")/.." && pwd)/db/certs"
[[ ! -e "$CERTS/server.key" ]] || { echo "Certificates already exist in $CERTS"; exit 1; }
mkdir -p "$CERTS"
cd "$CERTS"
umask 077
openssl req -x509 -newkey rsa:3072 -nodes -days 825 -subj "/CN=cotizai-db-ca" -keyout ca.key -out ca.crt 2>/dev/null
openssl req -newkey rsa:3072 -nodes -subj "/CN=db" -keyout server.key -out server.csr 2>/dev/null
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days 825 -out server.crt \
  -extfile <(printf 'subjectAltName=DNS:db\nextendedKeyUsage=serverAuth\n') 2>/dev/null
rm -f server.csr ca.srl
cat > pg_hba.conf <<'HBA'
# Connections from inside the database container (backups, health check).
local   all all                 trust
# Over the network: only with TLS and a password.
hostssl   all all all           scram-sha-256
hostnossl all all all           reject
HBA
chmod 755 "$CERTS"
chmod 644 ca.crt server.crt pg_hba.conf
# PostgreSQL only accepts a key that its own user (999 in the image) alone can read.
docker run --rm -v "$CERTS:/certs" --entrypoint sh pgvector/pgvector:pg16 -c 'chown 999:999 /certs/server.key && chmod 600 /certs/server.key'
echo "Certificates ready in $CERTS"
