// What a batch pass may write, and which modes reach which categories. Pure
// definitions shared by the engine, its preview and the admin panel, so keep this
// file free of server imports: the panel is a client component.

/** The categories a pass can write, grouped the way the admin reads them. */
export const FIELD_SCOPES = ['ficha', 'imagenes', 'notas', 'multimedia'] as const
export type FieldScope = typeof FIELD_SCOPES[number]

/** Which games a pass selects. */
export const BATCH_MODES = ['missing', 'fill', 'redo', 'wrong-provider', 'popularity', 'autocomplete-scores'] as const
export type BatchMode = typeof BATCH_MODES[number]

export const SCOPE_LABEL: Record<FieldScope, string> = {
  ficha:      'Ficha',
  imagenes:   'Imágenes',
  notas:      'Notas',
  multimedia: 'Multimedia',
}

/** The fields each category writes, as the admin reads them. */
export const SCOPE_FIELDS: Record<FieldScope, readonly string[]> = {
  ficha:      ['título', 'descripción', 'género', 'desarrollador', 'editor', 'año', 'fecha'],
  imagenes:   ['portada', 'fondo', 'logo', 'tile', 'capturas'],
  notas:      ['nota', 'Metacritic', 'valoración', 'popularidad'],
  multimedia: ['tráiler'],
}

/** How many fields each category holds. Derived, so the count and the list cannot drift. */
export const SCOPE_FIELD_COUNT: Record<FieldScope, number> = {
  ficha:      SCOPE_FIELDS.ficha.length,
  imagenes:   SCOPE_FIELDS.imagenes.length,
  notas:      SCOPE_FIELDS.notas.length,
  multimedia: SCOPE_FIELDS.multimedia.length,
}

/** Categories a mode can touch. A category outside this list is not applicable. */
export const MODE_APPLIES: Record<BatchMode, readonly FieldScope[]> = {
  'missing':             FIELD_SCOPES,
  'fill':                FIELD_SCOPES,
  'redo':                FIELD_SCOPES,
  'wrong-provider':      ['ficha', 'imagenes'],
  'popularity':          ['notas'],
  'autocomplete-scores': ['notas'],
}

/** How a mode reaches a category: everything, only the gaps, or not at all. */
export type Reach = 'all' | 'gaps' | 'none'

export function reachOf(mode: BatchMode, scope: FieldScope): Reach {
  if (!MODE_APPLIES[mode].includes(scope)) return 'none'
  return mode === 'fill' ? 'gaps' : 'all'
}

/**
 * The categories a pass runs with: the requested ones the mode applies to. Without
 * a request, every category the mode applies to.
 */
export function effectiveScope(mode: BatchMode, requested?: readonly FieldScope[]): FieldScope[] {
  const applies = MODE_APPLIES[mode]
  return requested === undefined ? [...applies] : applies.filter(f => requested.includes(f))
}

/**
 * The categories a run actually writes: the requested ones the mode applies to, minus
 * trailers or scores when they are switched off. The engine, the preview and the panel
 * all ask this, so the three cannot disagree. Popularity and autocomplete-scores always
 * run the score category: their switch does not apply to them.
 */
export function runScope(
  mode: BatchMode,
  requested: readonly FieldScope[] | undefined,
  flags: { withTrailers: boolean; withScores: boolean },
): FieldScope[] {
  const scoresAlways = mode === 'popularity' || mode === 'autocomplete-scores'
  return effectiveScope(mode, requested).filter(f =>
    (f !== 'multimedia' || flags.withTrailers) && (f !== 'notas' || flags.withScores || scoresAlways),
  )
}

export function isFieldScope(value: unknown): value is FieldScope {
  return typeof value === 'string' && (FIELD_SCOPES as readonly string[]).includes(value)
}

export function isBatchMode(value: unknown): value is BatchMode {
  return typeof value === 'string' && (BATCH_MODES as readonly string[]).includes(value)
}
