# GameHub web: auditoría y plan de rediseño

Fecha: 2026-10-21. Alcance: GameHub web (Next.js, Prisma sobre SQLite) y el contrato que usa GameHubNX.

Método: siete auditorías de solo lectura, una por área, cotejadas con lectura directa de código en los hallazgos críticos. No se ha cambiado código ni desplegado nada. Cada hallazgo indica si está verificado o solo reportado.

## 1. Resumen

- Hay tres problemas de fondo: lógica duplicada entre rutas que hacen lo mismo, estados que no coinciden entre módulos (cola, jobs, grupos de juegos, tipos de región) y una seguridad que no coincide con lo que documenta.
- No hay ningún test ni runner de tests. La CI solo ejecuta `tsc --noEmit`. Hoy cualquier refactor va a ciegas.
- Lo que GameHubNX consume es el contrato que no puede romperse. Es pequeño y está bien definido: siete endpoints JSON y las descargas por rango.
- Orden propuesto: contención de seguridad, red de tests de caracterización, canon de dominio, capa de servicios y API, admin y monitoreo, limpieza de zombis y, por último, la UI.

## 2. Fase 0: contención

| # | Problema | Dónde | Estado |
|---|---|---|---|
| 1 | Rutas de admin sin sesión: donations, traffic, traffic/live, curation (GET y POST /plan), library-issues, metadata/batch y jobs/active (GET) | `src/middleware.ts` (matcher y lista) y handlers sin comprobación | Verificado |
| 2 | `POST` y `DELETE /api/platforms` sin sesión. El DELETE borra la plataforma y sus juegos | `src/app/api/platforms/route.ts:16,61`; el middleware solo protege PATCH (`middleware.ts:17`) | Verificado |
| 3 | `GET /api/games/[id]` devuelve `filePath` del juego y de cada DLC (`include` sin `select`) | `src/app/api/games/[id]/route.ts:12-13` | Verificado |
| 4 | Juegos ocultos (`isHidden`) accesibles por id: detalle, cola, descarga y página | `api/games/[id]`, `api/queue`, `api/download/[gameId]`, `game/[id]/page.tsx` | Verificado: ninguno comprueba `isHidden` |
| 5 | Cola saltable: las peticiones con `Range` no exigen estado `ready` | `api/download/[gameId]/route.ts:51-61`, `api/download/dlc/[dlcId]/route.ts:31-38` | Verificado |
| 6 | Tokens generados con `Math.random()` y la hora | `src/lib/download-queue.ts:19-21` | Verificado |
| 7 | El límite de concurrencia no se cumple: `promoteNext` cuenta solo `downloading` | `src/lib/download-queue.ts:78` | Verificado por lectura |
| 8 | La privacidad declara retención de 7, 30 y 90 días, pero no existe ningún borrado por antigüedad | `src/app/privacy/page.tsx:77-84`; solo se borra por plataforma (`platforms/maintenance.ts:57`) | Verificado |
| 9 | La IP del cliente toma la primera `X-Forwarded-For` aunque `TRUST_PROXY` esté apagado. Alimenta logs y alertas | `src/lib/traffic.ts:4-11`, `src/lib/tracker.ts:133-141` | Reportado, sin verificar |
| 10 | Recuperar manualmente del cementerio devuelve 500 tras hacer commit (BigInt sin serializar) | `src/app/api/admin/graveyard/recover/route.ts:146-148` | Reportado, sin verificar |
| 11 | Borrar un juego con historial de descargas da error de clave foránea | `games/[id]/route.ts:49`, `games/merge/route.ts:49` | Reportado, sin verificar |
| 12 | Posible hueco de concurrencia: si falla el registro de inicio, el token queda en `downloading` sin liberarse | `api/download/[gameId]/route.ts:104-126` | Reportado, sin verificar |

Las filas 1 a 8 se corrigen con cambios pequeños: añadir rutas al matcher y comprobación de sesión en cada handler, `select` explícito, filtro de `isHidden`, `crypto.randomBytes` para tokens, y exigir estado `ready` o `downloading` en las peticiones con `Range`. Como está en producción, cada despliegue necesita tu visto bueno.

## 3. Contrato con GameHubNX

Lo que el cliente necesita del servidor. Cualquier cambio aquí exige prueba de contrato antes de desplegar.

- **Endpoints:** `GET /api/shop` (raíz con `files[]`, `directories[]` y `titledb`), `/api/shop/platforms`, `/api/shop/platform/{slug}`, `/api/shop/game/{id}`, `/api/shop/game/{id}/shot/{n}`, `/api/shop/homebrew`, `/api/shop/download/{id}/{filename}` y HEAD sobre las URLs de archivo.
- **Rangos:** una petición con `Range` responde 206 con `Content-Range` y longitud exacta. Nunca 200. Si responde 200, el cliente cae a descarga secuencial.
- **HEAD:** responde 2xx con `Content-Length` mayor que cero. No hay handler HEAD explícito; depende de que Next.js lo genere desde el GET (sin verificar).
- **La URL es la identidad:** el `infoHash` de la cola es el SHA-1 de la URL. Cambiar ruta, id, nombre o el sufijo `[TITLEID]` deja huérfanas las descargas pausadas.
- **Origen https:** las URLs absolutas dependen de `TRUST_PROXY` y de `X-Forwarded-Proto`. Si fallan, el cliente descarta archivos, portadas y subíndices.
- **Claves JSON:** `gh_group` es el groupKey crudo; cambiarlo cambia la clave de cada juego para el cliente. Renombrar una clave `gh_*` quita metadatos en silencio. Renombrar `files`, `repos` o `url` rompe la función.
- **Acceso:** el cliente no envía credenciales. Con `shop_password` activo todo responde 401. Desde una IP no privada, 403.
- **Cola:** las descargas de la tienda no pasan por la cola, así que `max_concurrent_downloads` no las limita (pregunta 4).
- **Velocidad:** el User-Agent `GameHubNX/` exime del límite de velocidad. El prefijo distingue mayúsculas.

Plan de prueba: fixtures capturadas de producción (anonimizadas) para cada endpoint. Los tests comparan forma, tipos, cabeceras y códigos. Los mismos fixtures sirven para probar el parseo en el cliente C++, que ya tiene `test_debrid_transfer`.

## 4. Hallazgos por área

### 4.1 Escáner y metadatos

- Tres ramas de escaneo con su propio find/create/update (`src/lib/scanner/index.ts:314-504`).
- La búsqueda de un juego existente va en orden distinto según la rama: ruta primero en una (`index.ts:100-104`) y groupKey primero en otra (`index.ts:201-205`).
- El groupKey se calcula de dos formas: `tid:` o `nameGroupKey` en modo carpeta, `gameGroupKey` en modo plano.
- En modo sin conexión se omite el barrido de obsoletos, pero `consolidatePlatform` sí borra juegos (`index.ts:514-518`).
- Una ROM hermana se tipa como `'region'` en el escáner y como `'update'` en el merge (`merge/route.ts:75`).
- Hay tres reglas distintas para heredar el Title ID (shop, dlc y updates).
- La portada manual (`coverManual`) se respeta en el batch pero no en la edición individual. El barrido `wrong-provider` puede reemplazar una portada elegida a mano.
- El valor `'rawg'` significa metascore o nota de usuario multiplicada por 20, según la ruta.
- `POST /api/scanner` escanea sin Job ni lock. Cancelar termina en `done` y la barra llega al 100 % (`batch.ts:534`).

### 4.2 Configuración

- La tabla `Setting` guarda texto libre. `PUT /api/settings` acepta cualquier clave, sin lista blanca ni tipos.
- `app_url` se guarda y nunca se lee. `google_search_api_key`, `bing_image_key` y `metrics_token` no tienen campo en la interfaz.
- Bug: el formulario guarda RAWG vacío y el `??` del código ignora la variable de entorno.
- La documentación dice que la contraseña de la tienda puede venir del entorno. No existe esa variable.
- Hay dos parsers numéricos distintos: `parseInt` y `Number`. En el segundo, un valor no numérico significa "sin límite".
- El límite de descargas tarda hasta 30 s en aplicarse, porque la caché no se invalida al guardar.

### 4.3 Admin y tablas de juegos

- Cuatro órdenes distintos y tres vocabularios de filtros. La tabla de admin consulta Prisma directamente y la pública usa la API.
- Paginación fija de 50 en admin y sin límite de `pageSize` en la pública.
- Hay filtros del admin (`score|cover|meta`) que el formulario no puede activar.
- El cementerio usa `<a>` y recarga la página completa.
- Muchos formularios ignoran `res.ok`: el aviso de "guardado" sale aunque la petición falle.
- Textos sin i18n y mezcla de español e inglés en los errores.

### 4.4 Tráfico y monitoreo

- Hay dos formas de contar descargas. La web registra una fila por cada tramo con `Range`; la tienda registra solo el inicio. Las cifras no son comparables.
- Las estadísticas se calculan en cada petición, sin agregados. La portada hace un groupBy de todo el historial en cada render, y las métricas de Prometheus cuentan tablas enteras.
- Faltan índices en los campos de filtro (`completed`, `client`, `device`, `RequestLog.path`).
- La pestaña de tráfico lanza unas 26 consultas cada 30 s sobre una sola conexión SQLite.
- Hay métricas que siempre valen cero: `errorCounts` (el beacon fija 200) y `avgLatencyMs` (el beacon no envía latencia).
- Los monitores de tráfico de admin no tienen sesión (fase 0).

### 4.5 Páginas públicas y tienda

- Lógica de presentación en el cliente que debería estar en el servidor: el nombre de los DLC y la versión de las actualizaciones se extraen del nombre de archivo, tanto en la página como en el modal. La agrupación y el ensamblado de ediciones también se repiten.
- El badge y el filtro no coinciden: el badge usa `unifiedScore()`, el filtro solo `rawgScore`.
- Las pastillas de plataforma filtran sobre el top 15 ya recortado, así que una pastilla puede mostrar dos juegos.
- El top de descargas hace `groupBy take:100` antes de filtrar `isHidden`.
- `/api/games` no desempata por id en `orderBy`, así que la paginación por offset puede repetir o saltar filas.
- Duplicados: `fetcher` definido cuatro veces, la lógica de screenshots en tres sitios, la elección ponderada aleatoria en dos y la URL de descarga construida en dos.

### 4.6 API y modelo de datos

- 65 rutas. Las dos clases de problema más graves son la autenticación inconsistente y la validación ausente.
- 12 modelos. Campos sin lectura: `igdbId`, `lastPlayedAt`, `playCount`, `rawgRatingsCount`, `clientVersion`, `referer`.
- No hay tests. `package.json` solo tiene `test:tags`. La CI ejecuta `tsc --noEmit`.
- Documentación que no coincide con el código: `docs/reference/api.md` marca rutas con sesión que no la tienen y documenta un `GET /api/admin/graveyard` que no existe. `environment.md` dice que toda mutación exige sesión. `architecture.md` aplica la IP solo a `/admin`. `switch-shop.md` dice que hay seis rutas de tienda protegidas, y son once. `database.md` no incluye el modelo `Job`.

## 5. Decisiones que necesito de ti

1. **Fase 0:** ¿apruebas parchear y desplegar las filas 1 a 8 de la sección 2? Son cambios pequeños. Recomiendo hacerlo cuanto antes.
2. **Retención:** ¿cuántos días para IP, rutas, búsquedas y descargas? La página dice 7, 30 y 90. Hay que elegir y, si cambia, corregir la página.
3. **Endpoints que gastan cuotas de terceros** (metadata GET, youtube, steamgriddb, google-images y screenshots): ¿públicos con límite de tasa o solo con sesión?
4. **Descargas de la tienda:** ¿deben contar para `max_concurrent_downloads`? Eso obligaría a GameHubNX a pasar por la cola, lo que implica cambiar el cliente. La alternativa es aceptar que no se limiten.
5. **Versionado:** propongo congelar `/api/shop/*` como contrato v1 y crear `/api/v2` para admin y web, con errores de forma uniforme.
6. **Herramienta de tests:** propongo Vitest contra una base SQLite temporal, ya que la base de datos es SQLite. ¿De acuerdo?
7. **Zombis:** ¿borro los confirmados en la fase 5 tras comprobar en los logs de acceso que nada externo los llama?

## 6. Plan por fases

### Fase 0: contención (una semana)

Salida: cada fila de la sección 2 cubierta por una prueba que espera 401 o 404 sin sesión, y despliegue aprobado.

### Fase 1: red de seguridad (antes de cualquier refactor)

- Montar Vitest con una base SQLite temporal por ejecución, usando las migraciones de Prisma.
- Añadir un job de CI que ejecute los tests. Hoy solo hay `tsc`.
- Tests de caracterización del contrato con GameHubNX, con fixtures de producción: forma, tipos, cabeceras (`Content-Length`, `Content-Range`), 206 y 416, HEAD, y 401 o 403 con contraseña e IP.
- Tests de seguridad: cada ruta de admin debe responder 401 sin sesión. Un test debe fallar si aparece una ruta `/api/admin/*` sin entrada en la lista.
- Tests de caracterización de las rutas que usa la UI: listado, detalle, búsqueda y cola.

Salida: suite en verde sobre el código actual. Cada refactor posterior debe mantenerla en verde.

### Fase 2: canon de dominio (decisiones, sin UI)

Un único significado para cada concepto, documentado en `docs/reference`:
- **Identidad de juego:** una sola función de groupKey y un orden de búsqueda único.
- **Tipo de ROM:** `base`, `region`, `update` o `dlc`, escrito por un solo módulo.
- **Title ID:** una sola regla de herencia.
- **Proveedores:** separar `rawgScore` (metascore), `userRating` y `unifiedScore`.
- **Portada manual:** se respeta en todas las escrituras.
- **Jobs:** un modelo con fila en `Job`, lock, cancelación y progreso. `POST /api/scanner` pasa a ser un job.
- **Descargas:** una máquina de estados para los tokens (`waiting`, `ready`, `downloading`, `done`, `expired`) y la decisión sobre la tienda (pregunta 4).

Salida: documento de dominio aprobado y tests unitarios de cada regla.

### Fase 3: servicios y API

- La lógica pasa a `src/lib/services/*` (escáner, metadatos, cola y estadísticas). Las rutas solo validan la entrada y llaman al servicio.
- Validación de entrada en todas las rutas. Hoy faltan en plataformas, en el PATCH de juegos (acepta cualquier columna, incluida `filePath`), en `PUT /api/settings`, en la paginación, en donaciones y en `queue/bulk`.
- Errores con forma uniforme `{error:{code,message}}` en `/api/v2`. `/api/shop/*` no cambia.
- Una sola escritura de metadatos: un `applyMetadata` que usen el batch, el automático, el editor y el merge.

Salida: cada ruta de v2 con su contrato probado, y los fixtures de v1 sin cambios.

### Fase 4: admin y monitoreo

- Modelo de eventos de descarga con semántica definida: una descarga es una sesión completa, sin contar tramos.
- Tabla de agregados calculada por un job, en lugar de consultas en cada petición.
- Trabajo de retención que cumpla la política de la pregunta 2, con prueba.
- Modelo de IP de confianza: solo se usa `X-Forwarded-For` con `TRUST_PROXY`. Sin proxy, la IP es la del socket.
- Índices según las consultas que queden.
- Eliminar las métricas que siempre valen cero o rehacerlas bien.

Salida: pestaña de tráfico con tiempos acotados y pruebas de retención.

### Fase 5: limpieza de zombis

Solo tras buscar en todo el repositorio y en los logs de acceso que nada los llame.

- **Sin llamador en el código:** `/api/donate`, `/api/download/game-extras/[gameId]` y `createBulkToken` (`src/lib/bulk-queue.ts`), `LoadingGrid.tsx`, `ui/toaster.tsx` (montado sin consumidor), `getQueueSnapshot`, `topPages` (calculado y nunca pintado), `REVIEW_THRESHOLD` (reexportado sin uso) y exports de `matrix.ts` sin importadores.
- **Endpoints sin UI:** `POST /api/scanner` (se sustituye al pasarlo a job en la fase 2), `GET /api/admin/metadata/batch` y `DELETE /api/games/[id]`.
- **Campos sin lectura:** `igdbId`, `lastPlayedAt`, `playCount`, `rawgRatingsCount`, `clientVersion`, `referer` y `SearchLog.results`.
- **Documentación:** corregir `api.md`, `environment.md`, `architecture.md`, `switch-shop.md`, `database.md`, la página de privacidad y `ONBOARDING.md`.

### Fase 6: UI (futura)

Se rediseña sobre la API v2 ya probada. Las páginas públicas dejan de tener lógica de presentación en el cliente, porque la API entregará los nombres de DLC y las agrupaciones ya resueltos.

## 7. Verificación pendiente

- Filas 9 a 12 de la sección 2: leer `src/lib/net.ts`, `graveyard/recover/route.ts`, `games/merge/route.ts` y `api/download/[gameId]/route.ts:104-126`.
- Que Next.js responde HEAD desde el GET de `/api/shop/download/*`. Probar con `curl -I` en staging.
- La auditoría del escáner dijo que `/api/scanner/stream` publica `filePath`. Con `grep` no aparece en la ruta; hay que revisar qué emite `src/lib/scanner`.
- Confirmar en los logs de acceso si algún cliente externo usa las rutas candidatas a zombis.
