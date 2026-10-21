# Brief de diseño: GameHub (administración y web pública)

Prompt para usar con un diseñador o con la skill de diseño. Fecha: 2026-10-21.

## Prompt

Eres diseñador de producto senior. Vas a rediseñar la interfaz de GameHub, una biblioteca de juegos (Nintendo Switch y emuladores) con una web pública, un panel de administración y un cliente en consola (GameHubNX). Los textos de la interfaz están en español (principal) e inglés; todo pasa por i18n.

**Objetivo de esta fase.** Un sistema de diseño base, una auditoría de las pantallas actuales y las pantallas de administración que no dependen de decisiones técnicas abiertas. Las pantallas de metadatos, notas y cola se diseñan en una fase posterior, cuando las decisiones estén tomadas.

**Identidad visual actual (mantenerla y ordenarla, no sustituirla):**
- Tema oscuro. Fondo hsl(240 10% 4%), tarjetas hsl(240 6% 8%), bordes hsl(240 4% 18%), texto hsl(0 0% 95%), texto secundario hsl(240 5% 55%).
- Color primario rojo hsl(0 72% 51%). Radio de esquina 0.5rem. Tipografía Plus Jakarta Sans.

**Restricciones:**
- Accesibilidad WCAG 2.1 AA. Foco visible. Respetar movimiento reducido.
- Responsive: el panel debe funcionar en tablet y la web pública en móvil.
- Cada color tiene un significado único y fijo: aviso, error, éxito, información y neutro. No usar el color como único indicador.
- No cambiar los contratos de la API. Los datos disponibles están descritos abajo.
- Un solo sistema de componentes. Como mínimo: tarjeta de estadística, chip de filtro, badge de estado, badge de procedencia del dato, barra de progreso de trabajo, tabla con filtros que se conservan al paginar, y panel de búsqueda de metadatos.

**Pantallas de administración (fase 1), en orden:**
1. **Panel.** Seis indicadores: juegos totales, plataformas, tamaño total, sin portada, sin metadatos y sin nota. Además, estado de los trabajos y de la salud del sistema. Cada indicador de problema lleva a la lista con el mismo filtro que lo cuenta. Un indicador en cero no debe destacar.
2. **Biblioteca.** Tabla con filtros combinables, paginación que conserva los filtros, estado visible por juego (metadatos, portada, nota, oculto) y acciones en lote.
3. **Ajustes.** Secciones por ámbito (metadatos, descargas, almacenamiento, administración). Cada campo con su ayuda. Los secretos aparecen enmascarados. Guardado por sección con validación.
4. **Tráfico.** Cifras con su definición visible, vista en vivo y vista de 30 días, y estados vacíos.
5. **Cementerio, curación y donaciones.** Versiones sencillas que sigan el mismo sistema.

**Pantallas de la web pública y de fases posteriores (no diseñar todavía, solo reservar espacio en el sistema):** editor de juego y búsqueda de metadatos como un único panel; escaneo y lotes como trabajos; ficha de juego unificada; cola de descarga y lote con todos sus estados; listados de inicio, plataforma y recientes.

**Para cada pantalla entregar:** propósito, acción principal, estados (vacío, cargando, error, con datos y filtro sin resultados), jerarquía visual, versión móvil y notas de accesibilidad.

**Estados de datos que deben poder verse:**
- Juego: metadatos (sin datos; con datos de automático o de manual), portada (sin portada; portada manual), nota (sin nota; crítica; valoración de usuario) y oculto.
- Descarga: en espera con posición, listo, descargando, terminado, caducado y error.
- Trabajo: en cola, en curso con progreso, cancelado y terminado con resumen (añadidos, quitados, cambiados).

**Entregables:**
- Auditoría de las pantallas actuales, con severidad de cada problema.
- Mapa de navegación del panel y de la web pública.
- Sistema base: colores con significado, tipografía, espaciado y lista de componentes.
- Maquetas de las pantallas 1 a 3, en oscuro y en móvil.
- Tabla de estados por pantalla.

**Fuera de alcance:** rediseñar el cliente de consola, cambiar nombres de endpoints y añadir funciones que no estén en el backlog (issues #50 a #126 de luishidalgoa/GameHub).

## Contexto técnico para quien implemente

- Dashboard: `src/app/admin/page.tsx`. Las tres tarjetas de problema enlazan a `/admin/games` con `cover=no-cover`, `meta=no-metadata` y `score=no-score`.
- Biblioteca: `src/app/admin/games/page.tsx`. Pierde los filtros al paginar (issue #121).
- Navegación del panel: `src/app/admin/layout.tsx`.
- Tokens: `src/app/globals.css` y `tailwind.config.ts`.
- Auditoría previa: `docs/planning/auditoria-y-plan.md`, `docs/planning/profundizacion.md`.
