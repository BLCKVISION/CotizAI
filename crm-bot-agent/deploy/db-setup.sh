#!/usr/bin/env bash
# Prepara (idempotente) el uso del PostgreSQL del host por el CRM, en su propia base:
#   - rol y base "crm_relay" (sin acceso para PUBLIC; no toca las demás bases)
#   - acceso por SOCKET UNIX (sin abrir puertos ni reiniciar Postgres): una línea en pg_hba.conf solo para ese rol
#   - credenciales en /opt/apps/crm-relay/.env (CRM_DB_USER / CRM_DB_PASSWORD / CRM_DB_NAME)
# Ejecutar como root:  bash deploy/db-setup.sh
set -euo pipefail

ENVF=/opt/apps/crm-relay/.env
DBN=crm_relay; DBU=crm_relay
PGV=$(ls /etc/postgresql | sort -V | tail -1)
HBA=/etc/postgresql/$PGV/main/pg_hba.conf
[ -f "$ENVF" ] || { echo "Falta $ENVF"; exit 1; }

grep -q '^CRM_DB_PASSWORD=' "$ENVF" || echo "CRM_DB_PASSWORD=$(openssl rand -hex 24)" >> "$ENVF"
grep -q '^CRM_DB_USER='     "$ENVF" || echo "CRM_DB_USER=$DBU" >> "$ENVF"
grep -q '^CRM_DB_NAME='     "$ENVF" || echo "CRM_DB_NAME=$DBN" >> "$ENVF"
PASS=$(grep '^CRM_DB_PASSWORD=' "$ENVF" | cut -d= -f2-)

sudo -u postgres psql -v ON_ERROR_STOP=1 -v pw="$PASS" <<'SQL'
SELECT 'CREATE ROLE crm_relay LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'crm_relay')\gexec
ALTER ROLE crm_relay PASSWORD :'pw';
SELECT 'CREATE DATABASE crm_relay OWNER crm_relay ENCODING ''UTF8'' TEMPLATE template0' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'crm_relay')\gexec
REVOKE ALL ON DATABASE crm_relay FROM PUBLIC;
GRANT CONNECT ON DATABASE crm_relay TO crm_relay;
SQL

if ! grep -qE '^local[[:space:]]+crm_relay[[:space:]]+crm_relay' "$HBA"; then
  cp -a "$HBA" "$HBA.bak-crm-$(date +%F)"
  # Debe ir ANTES de la regla genérica "local all all peer".
  sed -i '0,/^local[[:space:]]\+all[[:space:]]\+all[[:space:]]\+peer/s//local   crm_relay      crm_relay                               scram-sha-256\n&/' "$HBA"
  errs=$(sudo -u postgres psql -Atc "select count(*) from pg_hba_file_rules where error is not null")
  if [ "$errs" != "0" ]; then echo "pg_hba.conf inválido: restauro el original"; cp -a "$HBA.bak-crm-$(date +%F)" "$HBA"; exit 1; fi
  systemctl reload "postgresql@$PGV-main"   # reload: no corta conexiones
fi

PGPASSWORD="$PASS" psql -h /var/run/postgresql -U "$DBU" -d "$DBN" -Atc "select 'conexión por socket OK como ' || current_user || ' en ' || current_database()"
