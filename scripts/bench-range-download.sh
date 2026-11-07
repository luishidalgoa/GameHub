#!/usr/bin/env bash
# Mide la descarga por rangos desde un cliente de la misma red que la consola:
# una conexión frente a N conexiones en paralelo, cada una con un tramo de SEG_MIB.
#
# Uso:  scripts/bench-range-download.sh <url> [conexiones=4] [tramo_MiB=4]
# Opcional: CURL_OPTS="-H 'X-Cabecera: valor'" para pasar cabeceras (p. ej. la de la tienda).
#
# Imprime, por tramo: tiempo de conexión (≈ 1 RTT), TLS, primer byte, tasa, y al final el
# total agregado. Ejecutar primero con 1 conexión y después con 4; si 4 conexiones suben
# a ~5 MB/s y 1 se queda en ~1,6 MB/s, el techo es la ventana por conexión.
set -euo pipefail

URL="${1:?uso: $0 <url> [conexiones] [tramo_MiB]}"
WORKERS="${2:-4}"
SEG_MIB="${3:-4}"
SEG=$((SEG_MIB * 1024 * 1024))
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Tamaño del archivo desde las cabeceras (sigue redirecciones).
SIZE="$(curl -sIL ${CURL_OPTS:-} "$URL" | tr -d '\r' | awk 'tolower($1)=="content-length:"{s=$2} END{print s}')"
if [ -z "$SIZE" ]; then
  echo "No se pudo leer Content-Length de $URL" >&2
  exit 1
fi
echo "Archivo: $SIZE bytes · tramo: $SEG_MIB MiB · conexiones: $WORKERS"

START_NS=$(date +%s%N)
for ((i = 0; i < WORKERS; i++)); do
  OFFSET=$((i * SEG))
  if [ "$OFFSET" -ge "$SIZE" ]; then break; fi
  END=$((OFFSET + SEG - 1))
  if [ "$END" -ge "$SIZE" ]; then END=$((SIZE - 1)); fi
  (
    # shellcheck disable=SC2086
    curl -s -o /dev/null -r "$OFFSET-$END" ${CURL_OPTS:-} \
      -w "tramo=%{size_download} conexion_ms=%{time_connect} tls_ms=%{time_appconnect} ttfb_ms=%{time_starttransfer} total_s=%{time_total} tasa=%{speed_download}\n" \
      "$URL" > "$TMP/$i.txt"
  ) &
done
wait
END_NS=$(date +%s%N)

BYTES=0
for ((i = 0; i < WORKERS; i++)); do
  [ -f "$TMP/$i.txt" ] || continue
  cat "$TMP/$i.txt" | sed "s/^/conexion $i: /"
  b="$(sed -n 's/^tramo=\([0-9]*\).*/\1/p' "$TMP/$i.txt")"
  BYTES=$((BYTES + ${b:-0}))
done
ELAPSED_MS=$(( (END_NS - START_NS) / 1000000 ))
if [ "$ELAPSED_MS" -gt 0 ]; then
  echo "agregado: $BYTES bytes en ${ELAPSED_MS} ms = $((BYTES * 1000 / ELAPSED_MS / 1024)) KiB/s"
fi
