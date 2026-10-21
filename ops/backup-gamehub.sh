#!/bin/sh
# Copia diaria de la base de GameHub: copia consistente (sqlite .backup, válida
# aunque la app esté escribiendo), verificación de integridad y retención.
set -eu

SRC="${GH_DB:-/mnt/Cache/gamehub/gamehub.db}"
DST="${GH_BACKUP_DIR:-/mnt/Cache/gamehub/backups}"
KEEP="${GH_KEEP:-14}"

mkdir -p "$DST"
TS="$(date +%Y%m%d-%H%M%S)"
TMP="$DST/.gamehub-$TS.tmp"

sqlite3 "$SRC" ".backup '$TMP'"

if [ "$(sqlite3 "$TMP" 'pragma integrity_check')" != "ok" ]; then
  echo "integrity_check falló; se descarta $TMP" >&2
  rm -f "$TMP"
  exit 1
fi

mv "$TMP" "$DST/gamehub-$TS.db"

# Retención: solo toca las copias con este nombre; conserva las KEEP más recientes.
ls -1t "$DST"/gamehub-*.db 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f -- "$old"
done

echo "copia ok: $DST/gamehub-$TS.db"
