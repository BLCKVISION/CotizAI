#!/usr/bin/env bash
# Analyses the publishable files of this project with a throwaway SonarQube that only listens on this machine.
set -euo pipefail

NAME=cotizai-sonar
URL=http://127.0.0.1:19999
STATE="$HOME/.local/state/cotizai-sonar"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(git -C "$HERE" rev-parse --show-toplevel)"
mkdir -p "$STATE" && chmod 700 "$STATE"
umask 077

if ! docker container inspect "$NAME" >/dev/null 2>&1; then
  rm -f "$STATE/token" "$STATE/password"   # they belonged to a container that no longer exists
  docker run -d --name "$NAME" -p 127.0.0.1:19999:9000 -e SONAR_TELEMETRY_ENABLE=false \
    -e SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true -e SONAR_UPDATECENTER_ACTIVATE=false sonarqube:community >/dev/null
else
  docker start "$NAME" >/dev/null
fi

echo "Waiting for SonarQube..."
for _ in $(seq 1 120); do
  curl -s --max-time 5 "$URL/api/system/status" | grep -q '"status":"UP"' && break
  sleep 4
done
curl -s --max-time 5 "$URL/api/system/status" | grep -q '"status":"UP"' || { echo "SonarQube did not start: docker logs $NAME"; exit 1; }

if [[ ! -s "$STATE/token" ]]; then
  password="Aa1-$(python3 -c 'import secrets; print(secrets.token_urlsafe(18))')"
  code=$(curl -s -o /dev/null -w '%{http_code}' -u admin:admin -X POST "$URL/api/users/change_password" \
    --data-urlencode login=admin --data-urlencode previousPassword=admin --data-urlencode "password=$password")
  [[ "$code" == 204 ]] || { echo "No token and the admin password is unknown. Recreate it: docker rm -f $NAME"; exit 1; }
  printf '%s' "$password" > "$STATE/password"
  curl -s -u "admin:$password" -X POST "$URL/api/user_tokens/generate?name=scan-$(date +%s)" |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["token"], end="")' > "$STATE/token"
fi

work="$(mktemp -d)"
python3 -I "$HERE/collect.py" "$ROOT" "$work"
# Backend coverage, if a report was generated: pytest --cov=src/evaluador --cov-branch --cov-report=xml:<file>
coverage_args=()
if [[ -f "${COVERAGE_XML:-}" ]]; then
  cp "$COVERAGE_XML" "$work/backend/coverage.xml"
  coverage_args=(-Dsonar.python.coverage.reportPaths=backend/coverage.xml
    '-Dsonar.coverage.exclusions=frontend/**,backend/evals/**,backend/scripts/**,infra/**')
fi
chmod -R a+rwX "$work"

echo "Analysing $ROOT ($(git -C "$ROOT" log -1 --format=%h) plus uncommitted changes)..."
SONAR_TOKEN="$(cat "$STATE/token")" docker run --rm --network host -e SONAR_TOKEN -e SONAR_HOST_URL="$URL" \
  -v "$work:/usr/src" sonarsource/sonar-scanner-cli:latest \
  -Dsonar.projectKey=cotizai -Dsonar.sources=. -Dsonar.tests=backend/tests,frontend/tests \
  '-Dsonar.exclusions=backend/tests/**,frontend/tests/**,**/coverage.xml' -Dsonar.python.version=3.12 -Dsonar.scm.disabled=true "${coverage_args[@]}" \
  2>&1 | grep -E "ERROR|ANALYSIS SUCCESSFUL|files indexed|EXECUTION" | cut -c1-200

python3 -I "$HERE/report.py" "$STATE/token"
echo "Copy analysed (temporary): $work"
