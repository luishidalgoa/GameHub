// What a batch pass may write, field by field, and which fields each mode can touch.
// Pure definitions shared by the engine, its preview and the admin panel, so keep this
// file free of server imports: the panel is a client component.
//
// The mode decides who a pass selects and which fields it may touch at all. Inside that
// allowance, the admin picks the fields the pass writes. Nothing is written outside it.

/** The categories the admin reads the fields under. */
export const FIELD_SCOPES = ['ficha', 'imagenes', 'notas', 'multimedia'] as const
export type FieldScope = typeof FIELD_SCOPES[number]

/** Every field a pass can write. */
export const BATCH_FIELDS = [
  'title', 'description', 'genre', 'developer', 'publisher', 'releaseYear', 'releaseDate',
  'cover', 'backdrop', 'logo', 'tile', 'screenshots',
  'score', 'metacritic', 'rating', 'popularity',
  'trailer',
] as const
export type BatchField = typeof BATCH_FIELDS[number]

/** Which games a pass selects. */
export const BATCH_MODES = ['missing', 'fill', 'redo', 'wrong-provider', 'popularity', 'autocomplete-scores'] as const
export type BatchMode = typeof BATCH_MODES[number]

export const SCOPE_LABEL: Record<FieldScope, string> = {
  ficha:      'Ficha',
  imagenes:   'Imágenes',
  notas:      'Notas',
  multimedia: 'Multimedia',
}

export const FIELD_CATEGORY: Record<BatchField, FieldScope> = {
  title: 'ficha', description: 'ficha', genre: 'ficha', developer: 'ficha', publisher: 'ficha', releaseYear: 'ficha', releaseDate: 'ficha',
  cover: 'imagenes', backdrop: 'imagenes', logo: 'imagenes', tile: 'imagenes', screenshots: 'imagenes',
  score: 'notas', metacritic: 'notas', rating: 'notas', popularity: 'notas',
  trailer: 'multimedia',
}

export const FIELD_LABEL: Record<BatchField, string> = {
  title: 'Título', description: 'Descripción', genre: 'Género', developer: 'Desarrollador', publisher: 'Editora',
  releaseYear: 'Año', releaseDate: 'Fecha', cover: 'Portada', backdrop: 'Fondo', logo: 'Logo', tile: 'Tile',
  screenshots: 'Capturas', score: 'Nota', metacritic: 'Metacritic', rating: 'Valoración', popularity: 'Popularidad',
  trailer: 'Tráiler',
}

/** Fields that describe the ficha: a pass that writes one of them owns the ficha's state. */
export const FICHA_FIELDS: readonly BatchField[] = ['title', 'description', 'genre', 'developer', 'publisher', 'releaseYear', 'releaseDate']
/** Art: the cover, the background, the logo, the tile and the screenshots. */
export const IMAGE_FIELDS: readonly BatchField[] = ['cover', 'backdrop', 'logo', 'tile', 'screenshots']
/** Scores: the score and the Metacritic from the chain, plus RAWG's rating and popularity. */
export const SCORE_FIELDS: readonly BatchField[] = ['score', 'metacritic', 'rating', 'popularity']

/** The fields each category holds, in order. */
export const SCOPE_FIELDS: Record<FieldScope, readonly BatchField[]> = {
  ficha:      BATCH_FIELDS.filter(f => FIELD_CATEGORY[f] === 'ficha'),
  imagenes:   BATCH_FIELDS.filter(f => FIELD_CATEGORY[f] === 'imagenes'),
  notas:      BATCH_FIELDS.filter(f => FIELD_CATEGORY[f] === 'notas'),
  multimedia: BATCH_FIELDS.filter(f => FIELD_CATEGORY[f] === 'multimedia'),
}

/** How many fields each category holds. Derived, so the count and the list cannot drift. */
export const SCOPE_FIELD_COUNT: Record<FieldScope, number> = {
  ficha:      SCOPE_FIELDS.ficha.length,
  imagenes:   SCOPE_FIELDS.imagenes.length,
  notas:      SCOPE_FIELDS.notas.length,
  multimedia: SCOPE_FIELDS.multimedia.length,
}

// The full-flow modes never write RAWG's rating or popularity: those belong to the
// popularity pass, which fetches them.
const FULL_FLOW: readonly BatchField[] = BATCH_FIELDS.filter(f => f !== 'rating' && f !== 'popularity')

/** The fields each mode may touch. Anything outside this list is never written by that mode. */
export const MODE_FIELDS: Record<BatchMode, readonly BatchField[]> = {
  'missing':             FULL_FLOW,
  'fill':                FULL_FLOW,
  'redo':                FULL_FLOW,
  'wrong-provider':      ['title', 'description', 'genre', 'developer', 'publisher', 'releaseYear', 'releaseDate', 'cover', 'screenshots'],
  'popularity':          ['rating', 'popularity', 'score', 'metacritic'],
  'autocomplete-scores': ['score', 'metacritic'],
}

/** The categories a mode can touch: those holding at least one field the mode allows. */
const categoriesOf = (mode: BatchMode): FieldScope[] =>
  FIELD_SCOPES.filter(c => MODE_FIELDS[mode].some(f => FIELD_CATEGORY[f] === c))

export const MODE_APPLIES: Record<BatchMode, readonly FieldScope[]> = {
  'missing':             categoriesOf('missing'),
  'fill':                categoriesOf('fill'),
  'redo':                categoriesOf('redo'),
  'wrong-provider':      categoriesOf('wrong-provider'),
  'popularity':          categoriesOf('popularity'),
  'autocomplete-scores': categoriesOf('autocomplete-scores'),
}

/** How a mode reaches a category: everything, only the gaps, or not at all. */
export type Reach = 'all' | 'gaps' | 'none'

export function reachOf(mode: BatchMode, scope: FieldScope): Reach {
  if (!MODE_APPLIES[mode].includes(scope)) return 'none'
  return mode === 'fill' ? 'gaps' : 'all'
}

/**
 * The fields a pass may write, as the admin asked: the requested ones the mode allows.
 * Without a request, every field the mode allows.
 */
export function effectiveFields(mode: BatchMode, requested?: readonly BatchField[]): BatchField[] {
  return MODE_FIELDS[mode].filter(f => requested === undefined || requested.includes(f))
}

/**
 * The fields a run actually writes: the requested ones the mode allows, less the trailer
 * and the scores when their switches are off. The engine, the preview and the panel all
 * ask this, so the three cannot disagree. Popularity and autocomplete-scores always run
 * the score fields: their switch does not apply to them.
 */
export function runFields(
  mode: BatchMode,
  requested: readonly BatchField[] | undefined,
  flags: { withTrailers: boolean; withScores: boolean },
): BatchField[] {
  const scoresAlways = mode === 'popularity' || mode === 'autocomplete-scores'
  return effectiveFields(mode, requested).filter(f => {
    if (f === 'trailer') return flags.withTrailers
    if (f === 'score' || f === 'metacritic') return flags.withScores || scoresAlways
    return true
  })
}

export function isBatchField(value: unknown): value is BatchField {
  return typeof value === 'string' && (BATCH_FIELDS as readonly string[]).includes(value)
}

export function isBatchMode(value: unknown): value is BatchMode {
  return typeof value === 'string' && (BATCH_MODES as readonly string[]).includes(value)
}
