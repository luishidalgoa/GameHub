# GameHub web: infraestructura en este servidor y arquitectura de código

Fecha: 2026-10-21. Base: plan aprobado (secciones 2, 3, 6 y 7 de `docs/planning/auditoria-y-plan.md`) y encuesta de solo lectura. **(nuevo)** marca lo que todavía no existe.

## 1. Resumen

- **Topología (opción C):** un proyecto Compose con web, worker y curator desde la misma imagen, tag fijo y sin Watchtower, más un proyecto de staging en el mismo host. Apache sigue siendo la única entrada.
- **Arquitectura (opción B):** puertos y adaptadores, un composition root por proceso y reglas de dependencia comprobadas en CI.
- **Primer paso:** copia de la base y de las covers fuera de `/mnt/Cache`. La última copia de la base tiene unos 4,4 días de antigüedad y las covers no tienen ninguna.
- **Postgres: no ahora.** Las condiciones que lo cambiarían están en la sección 6.

## 2. Estado de partida

- Host x86_64, 4 vCPU, 15 GiB de RAM, unos 8 GiB libres y el swap de 2 GiB totalmente usado. La documentación describe una Raspberry Pi, que queda descartada.
- Escuchan en `0.0.0.0` (todas las interfaces): 3001 (GameHub), 3000 (Grafana), 9000 y 9001 (MinIO) y 3306 (MariaDB). Redis solo escucha en loopback. Si UFW no bloquea estos puertos, quedan expuestos a la LAN. Ver sección 8.
- Despliegue real en `~/services/GameHub`: imagen `:latest`, `/mnt/Cache/gamehub:/data` y Watchtower con sondeo de 300 s.
- Base viva `/mnt/Cache/gamehub/gamehub.db` (7,0 MB), sin backups automáticos. Covers en MinIO: 6.459 objetos, 619 MiB, en el mismo disco ext4.
- Web y curator escriben la misma base sin WAL ni `busy_timeout` explícito. Escaneo y metadatos corren dentro del proceso web. No hay manejo de SIGTERM.
- 65 route handlers, 46 de ellos importan `@/lib/db`. No hay tests; la CI solo ejecuta `tsc`.

## 3. Topología de hosting

### 3.1 Opciones

| Opción | A favor | En contra |
|---|---|---|
| A. Un contenedor con Watchtower | Cambio mínimo | Watchtower reinicia web y curator por separado y sin orden, corta trabajos en curso y migra sin copia previa; no hay staging |
| B. Web, worker y curator en un Compose con volumen compartido | Los trabajos sobreviven a los redespliegues del web; un único escritor de SQLite; el curator conserva red nula | Un contenedor más; despliegue por script |
| C. B más un proyecto de staging en el mismo host | La fase 0 exige staging (plan, sección 7); migraciones y contrato se prueban sobre una copia | Más RAM y disco; dos proyectos que mantener |

**Elegida: C.** Con unos 8 GiB libres, prod y staging caben con topes propuestos: web y worker de prod de 1 GiB, curator de 512 MiB, y web y worker de staging de 512 MiB. Se miden con `docker stats` en la fase 0. Recomiendo que el host no suspenda y que la sesión gráfica no forme parte del servicio; es decisión tuya.

### 3.2 Diseño

| Servicio | Red | Publicado | Volúmenes |
|---|---|---|---|
| `gamehub` (web) | default y `gamehub-s3` (nueva) | `127.0.0.1:3001→3000` | `/mnt/Cache/gamehub`→`/data` rw; `/mnt` ro |
| `gamehub-migrate` (nuevo) | default | ninguno | `/data` rw; un solo uso |
| `gamehub-worker` (nuevo) | `gamehub-s3` | ninguno | `/data` rw; `/mnt` ro |
| `gamehub-curator` | `none` | ninguno | `/data` rw; `/mnt` rw; sin `DATABASE_URL` |
| `gamehub-staging` (proyecto aparte, nuevo) | propia y `gamehub-s3` | `127.0.0.1:3002→3000` | `/mnt/Cache/gamehub-staging` (nuevo); biblioteca de fixtures, nunca `/mnt` |
| `minio` (existente) | añade `gamehub-s3` con alias `minio` | hoy `0.0.0.0:9000` y `9001`; pasa a `127.0.0.1` (cambio, no "sin cambio") | sin cambio |

Todos usan `ghcr.io/luishidalgoa/gamehub:${GAMEHUB_TAG}`, con `2.20.9` como valor inicial. Se elimina `:latest`.

**Entrada.** Apache sigue siendo la única puerta. El shop por LAN conserva el puerto 3001: Apache escucha en la IP LAN del servidor con `Require ip` y reenvía a `127.0.0.1:3001`, así GameHubNX no cambia de URL. Ese vhost también debe enviar `X-Real-IP`. Como todo el tráfico pasa por Apache, `TRUST_PROXY=true` es seguro: el contenedor no es alcanzable desde fuera del host. Grafana y MinIO quedan tras la LAN o la VPN WireGuard de `~/services/wg-portal`.

**Base.** No se mueve. `/mnt/Cache/gamehub` pasa a ser la ruta documentada, en lugar de `$APP_DIR/data`.

**Backups (nuevo).**
- Diario, como job del worker: `VACUUM INTO` a `/mnt/Cache/backups/gamehub/`, con web y worker escribiendo. No depende de `sqlite3`, que no he verificado. Se conservan 14 copias.
- Covers: `rclone` con un remote S3 de solo lectura contra MinIO, enviado a `gdrive` (`/mnt/gdrive`). Se usa la API, no los directorios internos de MinIO. No se usa `onedrive2`, que es el respaldo de fotos.
- Timer de systemd a las 03:30 para `rclone`. Restaurar covers después de la base es seguro, salvo borrados entre ambas copias.
- RPO de 24 h. El RTO se mide en el primer simulacro en staging y después cada mes.

**Observabilidad.** Healthcheck del web en `/api/health`, que ya devuelve 503 si MinIO falla (`src/app/api/health/route.ts:14`), en lugar de `/api/auth/me`, que siempre responde 200. El worker escribe un heartbeat en la base. Prometheus (existente) raspará `/api/metrics`. Cuatro alertas en Grafana: copia de más de 26 h, heartbeat de más de 2 min, reinicios y menos de 20 GB libres en `/mnt/Cache`. La configuración de Prometheus no está en el repo y hay que confirmarla.

**Despliegue y rollback.** CI construye la imagen en PR sin publicarla y publica en tags; el host solo hace `pull`. `ops/deploy.sh <tag>` (nuevo) sustituye al `update` actual, que no sincroniza nada (`deploy.sh:113`). Orden: snapshot de la base (aborta si falla), `pull`, `migrate`, `up -d --wait` y smoke test (`/api/health`, `Content-Length` en una descarga, 401 o 403 en `/api/shop`). Rollback: `ops/deploy.sh <tag-anterior>`, válido si las migraciones son aditivas; si una fue destructiva, `ops/restore-db.sh <snapshot>` (nuevo) y luego el tag anterior. Regla: expandir en una release y contraer en la siguiente. Staging primero; prod con tu aprobación.

## 4. Arquitectura de código

### 4.1 Opciones

| Opción | A favor | En contra |
|---|---|---|
| A. Capas (rutas, servicios, Prisma) | Simple y familiar | Nada impide que los servicios importen Prisma o Next; ya ocurre en `src/lib/auth.ts` y `shop-auth.ts`. Los procesos no tienen capacidades distintas |
| B. Puertos y adaptadores | Cada proceso recibe solo sus adaptadores; proveedores y almacenamiento intercambiables; casos de uso probados con dobles | Más carpetas y un composition root por proceso |
| C. Feature slices | Cambios locales | `groupKey`, tipo de ROM y Title ID se duplicarían por slice, cuando hoy ya hay tres ramas de escaneo y dos órdenes de búsqueda |

**Elegida: B**, agrupada por feature dentro de `application/`.

### 4.2 Árbol bajo `src`

```
src/
  domain/       (nuevo) reglas puras: groupKey, romType, titleId, scoring, estados de Job y tokens, validación de planes
  application/  (nuevo) casos de uso por feature: scanner, metadata, jobs, downloads, curation, stats, retention, backup, shop
  ports/        (nuevo) interfaces: GameRepository, JobStore, LibraryReader, LibraryWriter, CoverStore, MetadataProvider, PlanStore, ProgressSink, Clock, IdGenerator
  adapters/     (nuevo)
    persistence/prisma/  desde src/lib/db.ts y las consultas de las rutas
    storage/s3/          desde src/lib/s3.ts y src/lib/covers.ts
    storage/fs/          lectura de /mnt y renombrado de curación
    providers/           rawg, launchbox, steamgriddb, libretro, metacritic, youtube, google-images, kofi
    http/                cookies, NextResponse, mapeo de errores
  entrypoints/  (nuevo) web/, worker/, curator/ (src/worker/curation.ts se mueve aquí)
  app/          rutas y páginas finas: parsear, llamar a un caso de uso, mapear
  components/   sin cambios
  lib/          legado: se vacía por fases, no se borra de golpe
```

### 4.3 Reglas de dependencia

Dependency-cruiser las comprueba en CI desde la fase 1.
- `domain` solo importa `domain`. Prohibidos `next`, `@prisma/client`, `node:fs`, `sharp`, `child_process`, `@aws-sdk` y `fetch`. Tiempo y aleatoriedad llegan por puertos.
- `application` importa `domain` y `ports`. `ports` importa `domain`.
- `adapters` nunca importa `application` ni `entrypoints`.
- `entrypoints` componen. El web no recibe `LibraryWriter`; el curator no recibe Prisma ni red. Solo los adaptadores Prisma escriben SQLite, desde web y worker.
- `app/` y `components/` no importan adaptadores ni la base.
- Sin ciclos. Hoy `src/lib` no tiene ciclos ni imports de cliente a servidor, y eso se mantiene.

### 4.4 Proveedores externos

Cada proveedor es un adaptador detrás de un puerto: `MetadataProvider` (RAWG, LaunchBox, SteamGridDB, libretro, Metacritic, YouTube), `ImageSearch` (Google images), `CoverStore` (S3) y `DonationSource` (webhook de Ko-fi). No he identificado un módulo de Bing; su clave existe en Settings. Las cuotas de terceros (decisión 3 del plan) se controlan en el adaptador, no en las rutas.

### 4.5 Cómo consume trabajos el worker

- `Job` es la cola: `queued`, `running`, `done`, `failed`, `cancelled`. Campos nuevos: `ownerId`, `heartbeatAt`, `cancelRequested`, `parentId`.
- Un índice único parcial (migración SQL) permite un solo `running` por tipo. El auto-metadatos pasa a ser un job hijo de tipo `metadata`, así que nunca corre a la vez que uno manual.
- El web inserta filas. Progreso y cancelación pasan por la base, no por `globalThis` ni por un SSE atado a la petición.
- El worker sondea cada 2 s, reclama con `UPDATE ... WHERE status='queued'`, renueva el heartbeat cada 15 s y, al arrancar, reanuda desde `cursorId` sin esperar a que alguien abra el dashboard.
- SIGTERM: deja de reclamar, termina el elemento y devuelve el job a `queued` con su cursor. Gracia de 60 s, con `init: true` y `exec` en el CMD.
- El curator no abre la base: escribe un diario de renombrados (intención antes de cada `rename`) y resultados que el worker importa en una transacción. Así se corrige el apply no atómico de `src/lib/curation/apply.ts:176-184`.

## 5. Migración por fases

| Fase | Servidor | Código |
|---|---|---|
| 0. Contención (una semana) | Inventario con `sudo`. Copia de base y covers en `/mnt/Cache/backups/gamehub` (nuevo) y en gdrive, con timer y simulacro. Vhost LAN del shop antes de mover binds; luego puertos a loopback, `TRUST_PROXY=true` tras revisar `shop_password`, tag fijo, sin Watchtower y healthcheck nuevo. Staging con copia de la base y bucket `gamehub-staging` (nuevo) | Filas 1 a 8 de la sección 2, cada una con prueba de 401 o 404. `curl -I` en staging |
| 1. Red de seguridad | `ops/deploy.sh` y servicio `migrate` (nuevos); el web deja de migrar al arrancar | Vitest contra SQLite temporal; fixtures del contrato en `tests/fixtures/shop` (nuevo); CI con tests y build en PR |
| 2. Canon de dominio | Migración de expansión de `Job`; WAL y `busy_timeout` en ventana, probados antes en staging | `src/domain` con pruebas unitarias; UI y contrato sin cambios |
| 3. Servicios y API | `gamehub-worker` en prod y staging; curator sin `DATABASE_URL`; logs con rotación | Casos de uso, adaptadores y entrypoints; rutas finas; `/api/v2` con errores uniformes; `/api/shop` verificado con fixtures |
| 4. Admin y monitoreo | Scrape, dashboard, alertas y simulacro mensual | Agregados, eventos de descarga, retención en el worker, IP de confianza solo con `TRUST_PROXY` |
| 5. Zombis | Revisar logs de Apache; archivar copias antiguas de `gamehub.db`; borrar solo con tu aprobación | Quitar código y campos sin uso; corregir docs; quitar `nginx/` y `public/covers` |

## 5b. Antes de la fase 0: hallazgos urgentes del host

Estos no están en el plan de rediseño y van antes de cualquier cambio de topología:

1. **MariaDB (3306) escucha en `0.0.0.0`.** GameHub usa SQLite, así que MariaDB pertenece a otro servicio. Confirmar con `sudo ufw status` si el puerto está bloqueado; si no lo está, cerrarlo o limitarlo a loopback.
2. **MinIO (9000 y 9001) en `0.0.0.0`**, publicado además por Apache. Revisar que las credenciales de MinIO no sean las de fábrica y limitar el acceso directo al puerto.
3. **Swap totalmente usado** (2 GiB de 2 GiB). Con prod y staging a la vez habrá presión de memoria; conviene medirlo antes de añadir contenedores.
4. **`docker-compose.yml` está versionado en git** aunque `.gitignore` lo excluya (commits d4e3f6d y otros). Antes de seguir, comprobar que no contiene secretos en el historial; si los contiene, rotarlos.
5. **Copias de la base:** la última copia manual es del 16 de octubre (carpeta `gamehub-backup-2026-10-17`); no hay ninguna copia automática ni de covers.

## 6. Condiciones para Postgres (no ahora)

Se pasaría a Postgres si, medido durante 30 días con la fase 2 aplicada, ocurre alguna de estas:
- `SQLITE_BUSY` o timeouts P1008 en más del 1 % de las escrituras, con web y worker en carga real.
- Hace falta más de un host escribiendo la misma base (segundo servidor o alta disponibilidad).
- El `VACUUM INTO` tarda más de 5 minutos, o la base supera 2 GiB con escrituras continuas.
- Una migración necesita bloquear tablas más de un minuto.

Los umbrales son propuestas.

## 7. Decisiones que necesito de ti

- URL que usa GameHubNX hoy (IP:3001 o dominio). Define el vhost LAN y si `/api/shop` se bloquea en el dominio público.
- IP LAN del servidor, y si el host deja de suspenderse.
- Retención offsite: propongo 14 copias diarias locales y 8 semanales en gdrive.
- Confirmar con `sudo`: contenedores y mounts reales, `ufw status`, red de MinIO y configuración de Prometheus.

## 8. Verificación

De 59 afirmaciones: 54 confirmadas, 2 incorrectas y 3 sin verificar.
- Incorrectas, ya corregidas: el tamaño y la fecha de `gamehub.db` están desactualizados (ahora 7.012.352 bytes, modificado a las 00:42 del 21 de octubre), y `sqlite3` sí está instalado (`/usr/bin/sqlite3`).
- Sin verificar: que Docker salte UFW (requiere root); el valor de `shop_password` (está en la base de datos y no se leyó); y los recursos nuevos, que son propuestos y no existen.
- Las rutas y líneas de código citadas se comprobaron una a una. Los números de puertos y el estado de los servicios vienen de `ss` y `systemctl`.