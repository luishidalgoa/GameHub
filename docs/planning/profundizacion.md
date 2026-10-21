# GameHub: temas a profundizar antes de planificar

**Alcance.** Síntesis de cuatro investigaciones de solo lectura (descargas, escaneo, metadatos y cards del dashboard) sobre el árbol de trabajo actual, con verificación por lectura de código. No se ha ejecutado la app ni consultado la base de datos: los conteos del panel (2198 juegos, 9 plataformas, 862,02 GB, 0 sin portada, 3 sin metadatos, 40 sin nota) no están verificados. Los ejemplos de matching son réplicas de las funciones, no títulos reales de la base.

## 1. Temas a profundizar, por prioridad

**T1. Modelo de estado de metadatos (bloquea T2, T3 y T8).**
- Preguntas: qué significa «sin metadatos»; qué se guarda por juego y por proveedor (acierto, sin resultado, error transitorio); cuándo se reintenta.
- Decisiones del owner: (a) «sin metadatos» = sello de tiempo o campos presentes; (b) ¿el proveedor puede sobrescribir el título y los campos editados a mano?; (c) reintento de no_match: en cada pasada, con backoff o con cola de revisión manual.
- Hechos: la selección «missing» usa solo `metadataFetchedAt` nulo (batch.ts:177). El sello lo escriben batch.ts:520, metadata/[id]/route.ts:130 (condicional) y :197 (incondicional). El editor no lo sella. Un resultado solo con portada de libretro no sella y vuelve en cada pasada (compose.ts:150-160). Un 429 o 5xx se devuelve como vacío (launchbox.ts:166-169) y cuenta como no_match.
- Depende de: nada. Complementa #85, que unifica la escritura pero no define el estado.

**T2. Identidad y matching (depende de T1; tests con #69).**
- Preguntas: qué identificador gana (rawgId, rawgSlug, id de LaunchBox nuevo); qué normalización y umbral; cómo distinguir error de ausencia.
- Decisiones: orden de identidad; columna nueva para el id de LaunchBox; umbral 68 y regla de plataforma; tabla de 100-200 títulos reales como fixture.
- Hechos: la búsqueda es solo por título. compose.ts:53-68 no recibe ningún id y el esquema no tiene `launchboxId`. Patrones en la sección 2.

**T3. Modelo de la nota (depende de T1 y T2; cubre #80).**
- Preguntas: ¿`rawgScore` es la nota mostrada o la crítica?; ¿qué procedencia es canónica?; ¿una nota sin confianza se acepta?
- Decisiones: separar crítica y valoración de usuario; un único escritor de nota; si la nota de fallback exige match.
- Hechos: cinco rutas escriben la nota (sección 2). La pasada de popularidad usa `rawgRating × 20` como último recurso y el flujo completo no (batch.ts:256-257; scoreChain.ts:40-67).

**T4. Escaneo: raíces, ausencia y huella por fichero (prerrequisito del incremental).**
- Preguntas: ¿una fila por fichero o `Game` agrupado?; ¿qué huella basta?; ¿cuántas pasadas de gracia antes de ocultar?; ¿qué pasa con un disco desmontado?
- Decisiones: modelo `ScannedFile` (sección 4); `userHidden` separado de la ausencia; regiones en modo plano (¿ediciones o carta única?); multi-disco como región o como versión.
- Hechos: la única guardia es `fs.existsSync` (index.ts:322, 365, 480). docker-compose monta `/mnt` completo, así que un disco desmontado deja una carpeta vacía que pasa la guardia y marca todo como obsoleto sin error (index.ts:524-531). Un error a mitad de plataforma no impide el barrido (index.ts:506-509). Cada escaneo pone `isHidden: false` en los ficheros que encuentra (index.ts:218, 349, 412, 497), así que un ocultado manual se deshace. No hay mtime ni inode en el esquema.
- Depende de: #75 y #86 (job y lock), #77, #78 y #79 (canon de groupKey, tipo y Title ID). Las pasadas de metadatos que lanza dependen de T1.

**T5. Cola de descargas: qué ocupa un slot y cuándo caduca (urgente).**
- Preguntas: ¿un slot es permiso de descarga completa, ancho ocupado o límite por cliente?; ¿plazo de activación y de reanudación?; ¿puede reanudarse un token `done`?
- Decisiones: D1, D3, D4 y D9 del análisis (definición de slot, ventanas, reanudación tras terminar, barrido al arrancar).
- Hechos: los tokens `downloading` no caducan y nada los libera al arrancar; con `max_concurrent=1` bloquean la cola hasta corregir la BD a mano. La promoción solo ocurre en `enqueue` y `markDone`: si el token `ready` nunca se usa, el siguiente espera. Los clientes que solo usan Range no llaman a `markDone` y su token ocupa slot hasta caducar. El cambio sin commit exige estado en Range y devuelve 409 a `expired`, así que los rangos de más de 15 min desde la promoción fallan. La poda de `done`/`expired` usa `createdAt`, así que una reanudación tardía recibe 404.
- Bloqueado por: Q1 (¿GameHubNX pide Range con token de cola?), Q3 (¿cancela Next el stream al abortar?) y Q7 (¿se commitean los cambios sin commit de descarga?).
- Cubre: #82 (máquina de estados), #54, #56 y #60. La recuperación tras reinicio se apoya en #83, pero el concepto es de #82.

**T6. Ruta única de streaming y tienda frente a cola (depende de T5; #96 primero).**
- Hechos: la ruta DLC llama a `controller.enqueue` dentro de `data` sin backpressure (dlc/[dlcId]/route.ts:90-98), a diferencia de `createFileWebStream` con 4 MiB. El límite de velocidad solo aplica a juego y tienda: DLC, actualizaciones y lotes no lo usan, aunque el commit 7948556 diga lo contrario. Range: la web responde 416 si el final supera el tamaño y no admite sufijo; la tienda recorta y admite sufijo. La tienda no pasa por la cola (#102).

**T7. Lotes y página de cola (depende de T5).**
- Hechos: `StatusBadge` no tiene `expired` y la página de lote se rompe si lo recibe (queue/batch/page.tsx:215-223; verificado por lectura, no reproducido). La lista del lote vive en `sessionStorage` y se borra al cargar; la creación de N tokens no es transaccional. POST /api/queue no exige sesión y los tokens en espera no caducan ni se cancelan. En /queue/[token], «Download manually» no hace nada tras la descarga automática.

**T8. Cards del dashboard y contrato de filtros (depende de T1 para «sin metadatos»).** Ver sección 3.

## 2. Causas raíz

**Metadatos y matching**
1. **Selección por sello, no por contenido.** Un juego con descripción y género pero sin `metadataFetchedAt` cuenta como «sin metadatos», se busca por título en cada pasada y, si no matchea, queda como no_match para siempre. Si matchea, sobrescribe campos (batch.ts:461-467).
2. **Identidad descartada.** Ningún id interviene en la búsqueda. `applyManualPick` descarta el id de LaunchBox (metadata/[id]/route.ts:147-149).
3. **Títulos mal limpiados.** `utils.cleanTitle` quita todo lo que sigue al último punto: «Dr. Mario» se busca como «Dr», que puntúa 55 frente a «Dr. Mario» y nunca llega a 68. «Super Mario Bros. 3» pasa a «Super Mario Bros». Hay además dos `cleanTitle` incompatibles (rawg.ts:40-50 frente a utils.ts:27-34).
4. **Normalización.** scoring.ts:16 convierte apóstrofes y letras sin descomposición en espacio: «Kirbys Epic Yarn (USA)» frente a «Kirby's Epic Yarn» puntúa 50 con plataforma. LaunchBox usa `encodeURI`, así que «Ratchet & Clank» parte la consulta.
5. **Umbral con subtítulos y ediciones.** Jaccard penaliza los tokens extra: «Pokémon Red (USA)» frente a «Pokémon Red Version» = 63; «Pokémon Scarlet» frente a «Pokémon Scarlet Version» = 63 con plataforma; «Zelda Breath of the Wild» frente a «The Legend of Zelda: Breath of the Wild» = 72 con plataforma y 42 sin ella.
6. **Plataforma.** El bonus de +30 compara texto exacto (compose.ts:93-99). LaunchBox no rechaza otra plataforma: un título exacto de otra plataforma suma 70 y supera el umbral.
7. **Fallos como no_match.** 429, 5xx, clave RAWG inválida y timeouts se silencian (compose.ts:108 y :127).

**Notas**
1. **Cinco escritores con reglas distintas:** popularidad, autocompletar, flujo completo, ruta de un clic / `applyManualPick` y editor (GameEditorForm.tsx:184-214).
2. **Mismo campo, dos significados.** `scoreSource: 'rawg'` vale tanto para metascore como para valoración de usuario × 20 (batch.ts:257; scoreChain.ts:45,52). Al guardar en el editor, `'rawg'` se trata como crítico y se copia a `rawgMetacritic` (GameEditorForm.tsx:193-204). La migración usa `'metacritic'` para un caso parecido.
3. **Fallback sin confianza.** LaunchBox toma `candidates[0]` sin coincidencia exacta (launchbox.ts:489-491); Metacritic acepta la URL genérica sin plataforma (metacritic.ts:138-139). Se guardan sin umbral desde batch y score/route.ts.
4. **Lectura distinta.** La tarjeta usa `rawgScore ?? unifiedScore` (popularity.ts:121), mientras los contadores de «sin nota» miran solo `rawgScore`.
5. **Sellos que bloquean.** El editor y autocompletar fijan `popularityFetchedAt` (GameEditorForm.tsx:206; batch.ts:311), y la pasada de popularidad salta esos juegos salvo en redo.

## 3. Cards del dashboard y redirección

Las tarjetas «Sin portada» (`coverPath` y `coverUrl` nulos), «Sin metadatos» (`metadataFetchedAt` nulo) y «Sin nota» (`rawgScore` nulo) enlazan a `/admin/games?cover=no-cover`, `?meta=no-metadata` y `?score=no-score`. Las mismas definiciones están copiadas en cinco sitios: dashboard, página de juegos, export, API pública y batch.

Problemas verificados:
- **La página pierde el filtro al paginar o buscar.** games/page.tsx:47 construye la paginación sin cover, meta ni score, y el formulario GET no envía esos flags. Con más de 50 resultados, la página 2 muestra toda la biblioteca. Ningún issue de #50 a #106 lo cubre.
- **Chip y scroll.** El chip muestra un solo flag (score > cover > meta) aunque la consulta aplica los tres. La clave de `ScrollRestorer` no incluye los filtros.
- **«Sin portada» no coincide.** El batch (fill) usa solo `coverPath`; el dashboard usa ambos campos. Decisión del owner.
- **«Sin metadatos»** cuenta sellos, no datos (T1).
- **Ámbito de plataformas.** «Total games» y tamaño cuentan todas las plataformas, «9 plataformas» cuenta solo `enabled`, y /api/games y /platform/[slug] no filtran `enabled`.
- **Vocabularios distintos.** `cover=no-cover` en la URL, `noCover=1` en el export y `minRating=none` en la API pública.
- **Export.** No tiene guard propio (depende del middleware) y el CSV no neutraliza `=`, `+`, `-` ni `@`.
- **Estilo.** La tarjeta de portada tiene `text-amber-400` fijo; las otras dos solo colorean si el valor es mayor que 0. Los chips usan -300 y las tarjetas -400.

Redirección propuesta: un módulo `src/lib/games/filters.ts` con las tres cláusulas y un parser compartido por página, export y API; paginación y búsqueda que conserven toda la query. Los contadores pueden salir de #92.

## 4. Esquema de escaneo incremental

1. **Raíces.** `ScanRoot` sustituye el campo con barras de `Platform.scanPath`. Inventario con `lstat` asíncrono y concurrencia acotada (hoy `statSync` bloquea el event loop).
2. **Validación de raíz antes de tocar nada.** Existe, es legible, tiene marcador o dispositivo esperado y no cae el conteo bruscamente. Una raíz dudosa no oculta nada y queda registrada en `ScanLog`.
3. **Diff contra `ScannedFile`** (path único, platformId, rootId, size, mtimeMs, ino, role, groupKey, gameId, gameDlcId, lastScanRunId, missingSince): sin cambios, cambiado, nuevo, desaparecido o movido (mismo size e ino dentro de la raíz).
4. **Recalcular solo los groupKey afectados:** rol con una sola función, primario estable (se conserva mientras siga presente), add-ons enlazados por groupKey.
5. **Escritura por lotes transaccionales** solo de lo cambiado; marcar visto con `updateMany` por lista de ids.
6. **Ausencia** con `missingSince` y N pasadas de gracia; `userHidden` separado de `isHidden`.
7. **Auto-metadatos** solo para los ids creados en la pasada y según el estado de T1.
8. **Job único** (#75, #86) y un modo completo manual para reparar.

Coste: la estimación es de unas 4,4k sentencias y 2,2k escrituras con commit individual por pasada en modo plano para 2198 juegos. No es una medición; `ScanLog.startedAt` y `finishedAt` permiten medirla.

## 5. Backlog nuevo

Los 20 items propuestos están en el campo `backlog`. Ninguno repite #50-#106; los que se solapan parcialmente lo indican (complementa #80, #82, #85, #87, #98). Las ampliaciones de issues existentes se mencionan en las secciones anteriores y no se duplican como items.

## Abiertos (hallazgos no verificados)

- **Escaneo:** de los catorce hallazgos, solo se verificaron dos (raíz vacía y error a mitad). Quedan sin verificar: el modo plano colapsa el groupKey y el regroup duplica filePath (index.ts:100-104, 491-497); cancelar no detiene el escaneo y el job acaba en `done` (runner.ts:212-214); reanudar relanza el escaneo completo desde un GET (admin/jobs/active/route.ts:19); errores de recorrido sin registro (walker.ts:26-44); `consolidatePlatform` con rutas inaccesibles (index.ts:514-518); GET /api/scanner/stream sin autenticación (middleware.ts:8); auto-metadatos en cada alta (scanner/index.ts:604).
- **Metadatos:** la cuota de YouTube (100 unidades por `search.list`), la retirada de la API de Bing en 2025 y el hecho de que `background_image` no sea caja están sin verificar. Que LaunchBox trunque en el `&` es una inferencia. Que el texto de plataforma de LaunchBox difiera del catálogo es probable pero no está verificado en vivo.

## Descartados por el verificador

- Dashboard: el caso concreto del editor (se dijo que el juego deja de contar como «sin nota», pero ocurre al revés; el mecanismo del fallback de la tarjeta sí está verificado y queda en T3); el hallazgo de consultas repetidas y de índice en `schema.prisma:96` (el índice real está en la línea 138); el de inconsistencias de formato (`||` frente a `??` y unidad GiB con etiqueta GB).
- Matching: los ejemplos «Link's Awakening (Europe)» = 51 (real: 49) y «Mario Kart 8 Deluxe v1.0.2.nsp» = 59 (real: 55). La conclusión de que no llegan a 68 se mantiene con los ejemplos verificados.

## Lo que falta por investigar

- **Base de producción (solo lectura):** ninguna cifra del panel está confirmada. Hacen falta los 3 juegos sin metadatos y unos 10 de los 40 sin nota, con fichero, plataforma y estado. Las consultas de sqlite3 `-readonly` ya están en el informe de metadatos.
- **Logs de la última ejecución** para separar 429/5xx de no_match real.
- **Origen de los metadatos «incrustados»:** no hay importador de LaunchBox en `src/` ni `scripts/`, así que no se sabe qué los escribió.
- **Cliente GameHubNX:** no está en el repo (Q1). Pruebas en vivo pendientes: HEAD (Q2), abortos (Q3), `TRUST_PROXY` en producción (Q4), frecuencia de reinicios (Q5), si el límite de DLC fue intencional (Q6) y el comportamiento del navegador con descargas múltiples (Q8).
- **Medición del escaneo** con `ScanLog` de producción y número medio de add-ons por juego.
- **No revisado:** `games/merge` y si escribe metadatos; cards de tienda y página pública.
- **Plan:** la fila de `GET /api/admin/metadata/batch` en el plan está desactualizada (el código tiene `adminGuard`). Revisar #50 y corregir con #98.
- **Plataformas:** cuántas tienen `enabled=false` y si /api/games las sirve.