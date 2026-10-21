#!/usr/bin/env bash
# Despliegue de GameHub en produccion (#74).
#
#   ops/deploy.sh <tag>
#
# 1. Copia de la base con sqlite3 .backup. Si falla, se aborta antes de tocar nada.
# 2. Pone <tag> en las imagenes de gamehub y migrate del compose.
# 3. Pull de la imagen.
# 4. Migraciones en su servicio de un solo uso (migrate). Si fallan, vuelta atras.
# 5. gamehub arriba y sano (up --wait).
# 6. Prueba de humo contra /api/health.
# Si 3-6 fallan: vuelve la version anterior y restaura la copia de la base.
#
# Variables: APP_DIR (por defecto ~/services/GameHub), DB (por defecto /mnt/Cache/gamehub/gamehub.db),
# BACKUP_DIR (por defecto $APP_DIR/backups), HEALTH_URL (por defecto http://127.0.0.1:3001/api/health).
set -euo pipefail

TAG="${1:-}"
[ -n "$TAG" ] || { echo "uso: $0 <tag>   (p. ej. 2.22.0)" >&2; exit 2; }

APP_DIR="${APP_DIR:-$HOME/services/GameHub}"
DB="${DB:-/mnt/Cache/gamehub/gamehub.db}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/api/health}"
COMPOSE="$APP_DIR/docker-compose.yml"
IMAGE="ghcr.io/luishidalgoa/gamehub"

cd "$APP_DIR"
[ -f "$COMPOSE" ] || { echo "no existe $COMPOSE" >&2; exit 1; }

grep -q '^  migrate:' "$COMPOSE" || { echo "el compose no tiene el servicio migrate (#73); anadelo antes de desplegar" >&2; exit 1; }
PREV_TAG="$(sed -n "s|^ *image: ${IMAGE//\//\\/}:\([^ ]*\).*|\1|p" "$COMPOSE" | head -1)"
[ -n "$PREV_TAG" ] || { echo "no encuentro la etiqueta actual en $COMPOSE" >&2; exit 1; }
echo "version actual: $PREV_TAG  ->  nueva: $TAG"

# 1. Copia de la base. El fallo aborta el despliegue: sin copia no hay vuelta atras.
mkdir -p "$BACKUP_DIR"
SNAP="$BACKUP_DIR/pre-deploy-$TAG-$(date +%Y%m%d-%H%M%S).db"
sqlite3 "$DB" ".backup '$SNAP'"
[ "$(sqlite3 "$SNAP" 'pragma integrity_check')" = "ok" ] || { echo "la copia no pasa integrity_check; aborto" >&2; rm -f "$SNAP"; exit 1; }
echo "copia: $SNAP"

rollback() {
  echo "!! fallo en el despliegue: vuelvo a $PREV_TAG y restauro la base" >&2
  docker compose -f "$COMPOSE" stop gamehub >/dev/null 2>&1 || true
  cp -f "$COMPOSE.bak-$TAG" "$COMPOSE"
  cp -f "$SNAP" "$DB"
  docker compose -f "$COMPOSE" up -d gamehub
  echo "vuelta atras hecha; revisa los logs antes de reintentar" >&2
  exit 1
}
trap 'rollback' ERR

# 2. Etiqueta nueva en gamehub y migrate.
cp -a "$COMPOSE" "$COMPOSE.bak-$TAG"
sed -i "s|${IMAGE}:[^ ]*|${IMAGE}:${TAG}|g" "$COMPOSE"

# 3. Pull.
docker compose -f "$COMPOSE" pull gamehub migrate

# 4. Migraciones.
docker compose -f "$COMPOSE" run --rm migrate

# 5. Arranque con espera a que este sano.
docker compose -f "$COMPOSE" up -d --wait --wait-timeout 120 gamehub

# 6. Prueba de humo.
curl -fsS --max-time 10 "$HEALTH_URL" >/dev/null

trap - ERR
echo "desplegado $TAG (anterior: $PREV_TAG, copia: $SNAP)"
