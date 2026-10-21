# Decisiones del backlog (#100 a #105)

Aprobadas por el dueño el 21/10/2026, tal como se propusieron.

| Issue | Decisión | Dónde queda |
|---|---|---|
| #100 Retención de logs | Dirección IP: 7 días. Rutas (RequestLog): 7 días. Búsquedas: 30 días. Descargas: 90 días. Las IP de búsquedas y descargas se vacían a los 7 días; la caché de geolocalización caduca a los 7 días. | `src/lib/retention.ts` |
| #101 Endpoints que gastan cuotas | Límite de 60 peticiones por cliente cada 10 minutos, sin sesión, en YouTube, SteamGridDB, Google Images, LaunchBox, libretro y capturas. | `src/lib/quota.ts` |
| #102 Descargas de la tienda y la cola | Siguen fuera de la cola, como hasta ahora. Se cuentan aparte en las métricas. | Sin cambio de código |
| #103 Versionado de la API | `/api/shop/*` queda congelada como v1 (contrato de GameHubNX). `/api/v2` se hará para el admin y la web; no existe todavía. | Pendiente (#88, #106) |
| #104 Herramienta de tests | Vitest con SQLite temporal por ejecución. | `vitest.config.mts`, `tests/` |
| #105 URL y IP | GameHubNX usa `https://gamehub.hdglabs.com/api/shop`. La IP LAN del servidor es `192.168.0.24`. La tienda no se bloquea en el dominio público. | `GameHubNX/src/app/gamehub_catalog.cpp` |
