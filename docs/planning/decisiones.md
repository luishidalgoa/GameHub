# Decisiones del backlog (#100 a #105)

Aprobadas por el dueño el 21/10/2026, tal como se propusieron.

| Issue | Decisión | Dónde queda |
|---|---|---|
| #100 Retención de logs | Dirección IP: 7 días. Rutas (RequestLog): 7 días. Búsquedas: 30 días. Descargas: 90 días. Las IP de búsquedas y descargas se vacían a los 7 días; la caché de geolocalización caduca a los 7 días. | `src/lib/retention.ts` |
| #101 Endpoints que gastan cuotas | Límite de 60 peticiones por cliente cada 10 minutos, sin sesión, en YouTube, SteamGridDB, Google Images, LaunchBox, libretro y capturas. | `src/lib/quota.ts` |
| #102 Descargas de la tienda y la cola | Siguen fuera de la cola, como hasta ahora. Se cuentan aparte en las métricas. | Sin cambio de código |
| #103 Versionado de la API | `/api/shop/*` queda congelada como v1 (contrato de GameHubNX). `/api/v2` se hará para el admin y la web; no existe todavía. | Pendiente (#88, #106) |
| #104 Herramienta de tests | Vitest con SQLite temporal por ejecución. | `vitest.config.mts`, `tests/` |
| #105 URL y IP | GameHubNX usa `https://gamehub.hdglabs.com/api/shop`. La IP LAN del servidor es `192.168.0.24`. Pendiente: si `/api/shop` se bloquea en el dominio público (no estaba decidido). | `GameHubNX/src/app/gamehub_catalog.cpp` (otro repositorio) |

## Decisiones posteriores (21/10/2026)

| Issue | Decisión | Dónde queda |
|---|---|---|
| #84 Curator | Se retira el servicio `gamehub-curator` del compose de producción y su contenedor. El código de curación queda, pero nada aplica los planes de renombrado hasta que haya otro ejecutor. | `~/services/GameHub/docker-compose.yml` (copia en `.bak-sin-curator-*`) |
| #84 revertida (23/10/2026) | El aplicador vuelve como servicio `gamehub-curator`: el mismo código de la app, `network_mode: none`, `/mnt` escribible, corre como `1000:1001` (dueño de la biblioteca y grupo de la base). Solo aplica planes de `/data/curation`; no expone nada. Se validó con un ensayo, una copia previa y un registro para deshacer (`undo/`). | `~/services/GameHub/docker-compose.yml` (copia en `.bak-2.28-pre-curator`) |
| #112 Escaneo incremental | No se crea la tabla ScannedFile: no se quiere acumular datos residuales. Se mantiene la huella por tamaño. | Sin cambio de código |
| #126 Clave RAWG | Se queda en la URL: RAWG no admite cabecera. | Sin cambio de código |
| #114 Casos reales | Los casos de emparejamiento se sacan de la base de datos de producción. | `tests/` |
| #88 y #106 | El rediseño incluye la pantalla pública de inicio y las pantallas internas como tráfico, sobre `/api/v2`. | Pendiente |
| #91 Diagnósticos | Se registran los fallos de los clientes de GameHubNX y se muestran en tráfico. | Pendiente |
