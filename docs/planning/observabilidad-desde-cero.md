# Observabilidad y tráfico: qué capturar, desde cero

Fecha: 2026-10-21. Base: skill `observability-designer` (golden signals, RED/USE, SLI/SLO, señal frente a ruido) aplicada a GameHub en producción. Los datos de ejemplo vienen de una copia de la base de producción leída en solo lectura; son una foto, no una medición continua.

## 1. Diagnóstico: lo que hoy se registra y no sirve

| Lo que se mide | Problema comprobado | Dónde |
|---|---|---|
| Latencia de cada petición (`durationMs`) | Casi siempre vacía: solo se rellena si quien llama la pasa, y la baliza de visitas no la envía. | `src/lib/tracker.ts:223-243` |
| Estado HTTP (`status`) | Por defecto 200. Los errores 5xx no se registran. | `src/lib/tracker.ts:237` |
| Búsquedas sin resultados | `SearchLog.results` se guarda como 0 antes de ejecutar la consulta. Las 511 búsquedas de la copia salen «sin resultados»: la métrica no vale nada. | `src/app/api/games/route.ts:52` |
| Versión de GameHubNX | Sale del User-Agent, y el cliente envía siempre `GameHubNX/1.0.0` (constante fija). No hay adopción de versiones real. | `GameHubNX/src/app/gamehub_catalog.cpp:21` |
| Descargas | Una fila por tramo de 4 MiB, no por descarga. Un juego grande son cientos de filas. El 63 % de «completadas» de GameHubNX (408 de 645) es un número sin sentido. | `src/lib/traffic.ts`, `api/download/*` |
| Descargas sin fin | 307 de 1136 filas sin `finishedAt`: no se distingue entre abandono del cliente y fallo del servidor. | `DownloadLog` |
| IP | Se guarda en claro en cada petición, sin plazo de retención. | `RequestLog.ip`, `SearchLog.ip`, `DownloadLog.ip` |

Conclusión: hoy hay páginas vistas y filas por tramo, pero no hay señales de salud ni de éxito del servicio.

## 2. Principios (de la skill)

- **Golden signals** para el servicio: tráfico, latencia, errores, saturación.
- **RED** por ruta (ritmo, errores, duración) y **USE** para recursos (disco, base de datos, cola).
- **Preguntas antes que métricas**: cada señal responde a una decisión concreta. Si no hay decisión, no se captura.
- **Pocas alertas, todas accionables**. Un panel de 7 ± 2 elementos por pantalla.
- **SLO con presupuesto de error**: se diseñan con `slo-architect`, que es la skill indicada para la parte de SLO.
- **Minimizar datos personales**: pseudonimizar IP, sin User-Agent completo ni referer.

## 3. Qué capturar, por pregunta

### A. ¿Está sano el servicio? (golden signals)
- Peticiones por minuto y código de estado, por grupo de ruta (`shop`, `download`, `web`, `admin`, `api-otras`).
- Latencia p50, p95 y p99 por grupo de ruta.
- Tasa de 5xx por grupo, y los 10 errores más frecuentes con su ruta.
- Base de datos: latencia de consulta, errores de escritura.
- Disco: espacio libre en `/mnt/Cache` y en el volumen de la base.
- Cola: tokens en espera, tokens en `ready` que caducan sin usarse, descargas activas frente al máximo configurado.
- Trabajos: duración, fallos y heartbeat (escaneo, metadatos, curación).

### B. ¿Funciona descargar? (producto y cliente)
Medir por **sesión de descarga**, no por tramo. Una sesión empieza con el primer byte servido y termina cuando el archivo está completo, cuando el cliente abandona o cuando el servidor falla.
- Motivo de fin: `completed`, `client_abort`, `server_error`, `file_missing`, `expired_token`.
- Tiempo desde que un token queda `ready` hasta el primer byte.
- Número de reanudaciones por sesión (peticiones `Range` posteriores al primer tramo).
- Bytes servidos frente al tamaño del archivo.
- Éxito por cliente (GameHubNX, navegador, otro) y por versión de GameHubNX cuando el cliente la envíe bien.

### C. ¿Qué busca y qué le falta a la gente? (demanda y catálogo)
- Búsquedas normalizadas (minúsculas, sin acentos) con **número real de resultados**.
- Búsquedas sin resultados, agrupadas: son la lista de juegos que faltan o que se buscan mal.
- Juegos más descargados por plataforma (ya se mide; mantener, pero por sesión).
- Juegos visibles sin portada, sin metadatos o sin nota: ya los calcula el panel; añadir su evolución en el tiempo.

### D. ¿Está alguien probando la puerta? (seguridad)
- Respuestas 401 y 403 por ruta, con IP pseudonimizada.
- Peticiones de token desconocido o caducado (404 y 409), que delatan intentos de adivinar tokens.
- Activaciones del límite de tasa.
- Intentos de acceso a rutas de admin sin sesión.

### E. ¿La versión nueva rompe algo? (despliegue)
- Tasa de error y latencia por versión de la aplicación (etiqueta de build en todas las métricas).
- Resultado de cada despliegue: smoke test, versión anterior y posterior.

## 4. Qué NO capturar

- IP en claro en cada petición. Usar IP pseudonimizada con sal diaria, o solo país.
- User-Agent completo: basta con el cliente y la versión, ya extraídos.
- Referer.
- Contadores que no se leen (`playCount`, `rawgRatingsCount`, `igdbId`, `lastPlayedAt`).

## 5. Modelo de datos propuesto

- **`RequestRollup`**: minuto, grupo de ruta, código de estado agrupado (2xx, 4xx, 5xx), recuento, suma de milisegundos y cubos de latencia. Se escribe un registro por minuto y grupo, no uno por petición. Reduce escrituras y elimina la IP de esta tabla.
- **`DownloadSession`**: token, juego o DLC, cliente, versión de cliente, inicio, último byte, bytes servidos, reanudaciones, motivo de fin.
- **`SearchEvent`**: consulta normalizada, número de resultados, minuto.
- **`SecurityEvent`**: tipo, grupo de ruta, IP pseudonimizada, minuto.
- Retención: la que declara la página de privacidad. Las agregaciones (rollups) se guardan más tiempo que los eventos sueltos; esa es la forma de conservar tendencias sin conservar datos personales.

Volumen: la copia de producción tiene unas 2 100 peticiones registradas y 1 136 descargas en cinco meses. SQLite basta de sobra. No recomiendo tracing distribuido, ELK ni un servicio SaaS de errores: son coste y mantenimiento sin un problema que resolver.

## 6. SLO propuestos (a validar con `slo-architect`)

1. **Disponibilidad de la tienda** (`/api/shop/*`): 99,5 % de peticiones sin 5xx, medido en ventanas de 30 días.
2. **Éxito de descarga**: 95 % de sesiones que terminan en `completed` o `client_abort`, excluyendo los abortos del cliente. Medido por sesión.
3. **Latencia de catálogo**: p95 de `/api/shop/*` por debajo de 300 ms.

## 7. Paneles y alertas

Paneles (tres, dentro del límite de siete):
- **Operación**: tráfico, latencia p95, 5xx, disco, cola, trabajos.
- **Descargas**: funnel (token → ready → primer byte → completada), motivos de fin, éxito por cliente y versión.
- **Catálogo y demanda**: búsquedas sin resultados, juegos más pedidos, huecos de metadatos.

Alertas (seis como máximo, todas con acción clara):
1. Health de la tienda en 503 durante más de 5 minutos.
2. Tasa de 5xx por encima del 1 % durante 10 minutos.
3. Éxito de descarga por debajo del 90 % en una hora, con al menos 20 sesiones.
4. Disco libre por debajo de 20 GB.
5. Copia de la base con más de 26 horas.
6. Heartbeat de un trabajo sin actualizar durante más de 2 minutos.

## 8. Plan de implantación

**Fase 0: corregir la medición (días).** Sin cambios de esquema grandes.
- Registrar código de estado real y duración en el middleware.
- Guardar `results` después de ejecutar la búsqueda.
- Dejar de usar la baliza para latencia.

**Fase 1: sesiones y rollups.** Crear `DownloadSession` y `RequestRollup`. Mantener `DownloadLog` en paralelo durante un mes y comparar cifras antes de retirarlo.

**Fase 2: versión real del cliente.** Hacer que GameHubNX envíe su versión de build en el User-Agent. Es un cambio del cliente, y necesita una release.

**Fase 3: paneles y alertas en Grafana.** Prometheus ya existe en el host. Exponer los contadores en `/api/metrics` y montar los tres paneles y las seis alertas.

**Fase 4: revisión.** Tras un mes, decidir qué señales no se usan y quitarlas.

## 9. Decisiones que necesito

1. ¿Qué plazo de retención aplicamos a sesiones y rollups? Propongo 90 días para sesiones y un año para rollups agregados.
2. ¿Aceptas la IP pseudonimizada con sal diaria para contar visitantes únicos?
3. ¿Quieres que GameHubNX envíe su versión real? Requiere release del cliente.
4. ¿Qué SLO aceptas (sección 6)?

## 10. Verificación pendiente

- Confirmar que el middleware no registra las peticiones de API: la copia tiene sobre todo páginas. Si es así, la tasa real de peticiones está subestimada.
- Confirmar cuántas peticiones `Range` produce una descarga completa de un juego grande, para calibrar el coste del modelo actual.
- Confirmar con `slo-architect` los SLO de la sección 6.
