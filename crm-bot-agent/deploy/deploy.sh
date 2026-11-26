#!/usr/bin/env bash
# Deploy automático de crm-relay (docker compose). Se ejecuta por cron cada 5 min:
#   */5 * * * * /usr/local/bin/deploy-crm-relay.sh
# Solo reconstruye cuando hay commits nuevos en origin/main. Si el build falla, los contenedores
# actuales siguen sirviendo y no se reintenta el mismo commit durante 30 min.
set -euo pipefail

REPO="${REPO:-git@github-develop:exmachina-develop/crm-bot-agent.git}"
BRANCH="${BRANCH:-main}"
DIR="${DIR:-/opt/apps/crm-relay}"
LOG="${LOG:-/var/log/deploy-crm-relay.log}"
PROJECT="crm-relay"
STATE="$DIR/.deploy-state"          # sha desplegado / sha fallido + hora

exec >>"$LOG" 2>&1
exec 9>/var/lock/deploy-crm-relay.lock
flock -n 9 || exit 0
log() { echo "[$(date '+%F %T')] $*"; }

REMOTE_HEAD=$(git ls-remote "$REPO" "refs/heads/$BRANCH" 2>/dev/null | cut -f1 || true)
[ -n "$REMOTE_HEAD" ] || exit 0       # sin red o sin acceso: no hacer nada

if [ ! -d "$DIR/.git" ]; then
  log "Clonando $REPO"
  mkdir -p "$(dirname "$DIR")"
  git clone --branch "$BRANCH" "$REPO" "$DIR"
fi
cd "$DIR"
[ -f .env ] || { log "ERROR: falta $DIR/.env (ver deploy/README.md)"; exit 1; }

DEPLOYED=$(cat "$STATE.ok" 2>/dev/null || echo none)
RUNNING=$(docker ps -q -f "label=com.docker.compose.project=$PROJECT" -f "status=running" | wc -l)
if [ "$DEPLOYED" = "$REMOTE_HEAD" ] && [ "$RUNNING" -ge 3 ]; then
  exit 0
fi

# Backoff: si este mismo commit falló hace menos de 30 min, esperar.
if [ -f "$STATE.fail" ]; then
  read -r FSHA FTS < "$STATE.fail" || true
  if [ "${FSHA:-}" = "$REMOTE_HEAD" ] && [ $(( $(date +%s) - ${FTS:-0} )) -lt 1800 ]; then exit 0; fi
fi

git fetch --prune origin "$BRANCH"
git reset --hard FETCH_HEAD
log "Deploy ${DEPLOYED:0:7} -> ${REMOTE_HEAD:0:7}"

fail() { log "FALLO: $1"; echo "$REMOTE_HEAD $(date +%s)" > "$STATE.fail"; exit 1; }

set -a; . ./.env; set +a
COMPOSE=(docker compose -p "$PROJECT" -f docker-compose.yml -f docker-compose.prod.yml)

"${COMPOSE[@]}" build || fail "build"
"${COMPOSE[@]}" up -d --remove-orphans || fail "up"

# Health check: /health del backend (comprueba la BD) y el frontend sirve la SPA.
for _ in $(seq 1 30); do
  api=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${API_PORT:-3104}/health" || true)
  web=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${WEB_PORT:-3103}/" || true)
  if [ "$api" = "200" ] && [ "$web" = "200" ]; then
    echo "$REMOTE_HEAD" > "$STATE.ok"; rm -f "$STATE.fail"
    log "OK ${REMOTE_HEAD:0:7}"
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 3
done
fail "health check (api=$api web=$web)"
