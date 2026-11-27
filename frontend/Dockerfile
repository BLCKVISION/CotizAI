# syntax=docker/dockerfile:1.7
# Etapa 1: dependencias (capa cacheable mientras no cambie package-lock.json)
FROM node:22-alpine AS dependencias
WORKDIR /w
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Etapa 2: exportar la app web estática
FROM dependencias AS construccion
ARG EXPO_PUBLIC_API_URL=/
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL
COPY . .
RUN npx expo export --platform web --output-dir dist

# Etapa 3: Caddy sirve los estáticos y hace proxy de /api (mismo origen: sin CORS, TLS automático)
FROM caddy:2-alpine AS ejecucion
COPY --from=construccion /w/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
RUN adduser -S -u 10001 app && chown -R app /data /config
USER app
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
