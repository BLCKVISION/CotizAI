#!/usr/bin/env bash
# Dumps the database to a private folder, checks the file and removes old copies.
# Run by hand or from cron on the server, for example every night:
#   15 3 * * * /opt/apps/cotizai/infra/scripts/backup-db.sh >> /var/log/cotizai-backup.log 2>&1
# Keep a copy outside the server too, and keep EVALUADOR_CLAVE_CIFRADO separately: without it the data is unreadable.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/root/backups/cotizai-db}"
KEEP_DAYS="${KEEP_DAYS:-14}"
DB_CONTAINER="${DB_CONTAINER:-$(docker ps -q --filter label=com.docker.compose.project=evaluador --filter label=com.docker.compose.service=db)}"
[[ -n "$DB_CONTAINER" ]] || { echo "Database container not found"; exit 1; }

umask 077
mkdir -p "$BACKUP_DIR"
target="$BACKUP_DIR/cotizai-$(date +%Y%m%d-%H%M%S).sql.gz"
trap 'rm -f -- "$target.partial"' EXIT
docker exec "$DB_CONTAINER" pg_dump -U evaluador -d evaluador | gzip > "$target.partial"
gzip -t "$target.partial"
# A dump that stopped half way is still a valid gzip file: only a complete one ends with this line.
gunzip -c "$target.partial" | tail -n 5 | grep -q "PostgreSQL database dump complete"
mv -- "$target.partial" "$target"
find "$BACKUP_DIR" -maxdepth 1 -name 'cotizai-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backup ok: $target ($(stat -c %s "$target") bytes)"
