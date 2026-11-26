#!/usr/bin/env bash
# Despliegue en el servidor: nginx del host + estáticos + API en Docker.
#   ./infra/deploy.sh nginx      instala/actualiza la config de nginx (solo archivos propios) y recarga si es válida
#   ./infra/deploy.sh frontend   exporta la web y la publica en /var/www/hackathon
#   ./infra/deploy.sh api        levanta api + db (docker compose, puertos solo en loopback)
#   ./infra/deploy.sh tls        emite certificados (requiere que el DNS ya apunte a este servidor)
#   ./infra/deploy.sh todo       nginx + frontend + api
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
WEB_DOMINIO="hackathon.exmachina.systems"
WEB_ALIAS="cotiz-ai.exmachina.systems"   # mismo frontend, segundo nombre
API_DOMINIO="api-hackathon.exmachina.systems"
DESTINO_WEB="/var/www/hackathon"

nginx_cfg() {
  install -m 0644 "$RAIZ/infra/nginx/hackathon-limites.conf" /etc/nginx/conf.d/hackathon-limites.conf
  install -m 0644 "$RAIZ/infra/nginx/hackathon-proxy.conf"   /etc/nginx/snippets/hackathon-proxy.conf
  install -m 0644 "$RAIZ/infra/nginx/hackathon-seguridad.conf" /etc/nginx/snippets/hackathon-seguridad.conf
  for d in "$WEB_DOMINIO" "$API_DOMINIO"; do
    # Si certbot ya modificó el sitio (TLS), no se pisa: se conserva la versión instalada.
    if [[ -f /etc/nginx/sites-available/$d ]] && grep -q "managed by Certbot" /etc/nginx/sites-available/$d; then
      echo "· $d ya tiene TLS gestionado por certbot: se conserva"
    else
      install -m 0644 "$RAIZ/infra/nginx/$d.conf" /etc/nginx/sites-available/$d
    fi
    ln -sfn /etc/nginx/sites-available/$d /etc/nginx/sites-enabled/$d
  done
  nginx -t
  systemctl reload nginx
  echo "✔ nginx recargado"
}

frontend() {
  local api_url="${EXPO_PUBLIC_API_URL:-https://$API_DOMINIO}"
  (cd "$RAIZ/frontend" && EXPO_PUBLIC_API_URL="$api_url" CI=1 npx expo export --platform web --output-dir dist)
  # Publicación atómica: cada versión en su carpeta y /var/www/hackathon es un enlace que se intercambia.
  local version="$DESTINO_WEB.v$(date +%Y%m%d%H%M%S)"
  cp -a "$RAIZ/frontend/dist" "$version"
  ln -sfn "$version" "$DESTINO_WEB.nuevo"
  mv -Tf "$DESTINO_WEB.nuevo" "$DESTINO_WEB"
  # Conserva las 3 últimas versiones; las anteriores se eliminan.
  ls -dt "$DESTINO_WEB".v* 2>/dev/null | tail -n +4 | xargs -r rm -r
  echo "✔ frontend publicado: $DESTINO_WEB -> $version"
}

api() {
  [[ -f "$RAIZ/infra/.env" ]] || { echo "Falta infra/.env (copie infra/.env.example)"; exit 1; }
  docker compose -f "$RAIZ/infra/compose.yml" --env-file "$RAIZ/infra/.env" up -d --build
  echo "✔ api + db levantados (127.0.0.1:18001)"
}

tls() {
  # Emite/amplía el certificado SOLO con los nombres que ya resuelven a este servidor (HTTP-01 lo exige).
  local ip_local dominios=() d ip
  ip_local="$(curl -s https://api.ipify.org)"
  for d in "$WEB_DOMINIO" "$WEB_ALIAS" "$API_DOMINIO"; do
    ip="$(dig +short @8.8.8.8 "$d" | head -1)"
    if [[ "$ip" == "$ip_local" ]]; then dominios+=(-d "$d"); echo "· $d -> $ip ✔"
    else echo "· $d -> ${ip:-sin registro} (se omite; vuelva a ejecutar cuando apunte a $ip_local)"; fi
  done
  [[ ${#dominios[@]} -gt 0 ]] || { echo "Ningún dominio apunta aún a este servidor."; exit 1; }
  certbot --nginx --non-interactive --agree-tos --redirect --expand --cert-name "$WEB_DOMINIO" "${dominios[@]}"
}

case "${1:-}" in
  nginx) nginx_cfg ;;
  frontend) frontend ;;
  api) api ;;
  tls) tls ;;
  todo) nginx_cfg; frontend; api ;;
  *) sed -n '2,8p' "$0"; exit 1 ;;
esac
