/**
 * Cuantos metadatos tiene un juego: una suma ponderada de los campos que se rellenan.
 * Los pesos suman 100; un juego sin ningun campo vale 0 % y uno completo, 100 %.
 */
export const FIELD_WEIGHTS = [
  { key: 'cover', label: 'Portada', weight: 20 },
  { key: 'description', label: 'Descripción', weight: 15 },
  { key: 'score', label: 'Nota', weight: 15 },
  { key: 'year', label: 'Año', weight: 10 },
  { key: 'genre', label: 'Género', weight: 10 },
  { key: 'developer', label: 'Desarrollador', weight: 10 },
  { key: 'publisher', label: 'Editora', weight: 10 },
  { key: 'screenshots', label: 'Capturas', weight: 5 },
  { key: 'trailer', label: 'Tráiler', weight: 5 },
] as const

export type FieldKey = (typeof FIELD_WEIGHTS)[number]['key']

export interface CompletenessInput {
  coverPath: string | null
  coverUrl: string | null
  description: string | null
  rawgScore: number | null
  releaseYear: number | null
  genre: string | null
  developer: string | null
  publisher: string | null
  screenshotPaths: string | null
  trailerUrl: string | null
}

const filled = (s: string | null | undefined) => typeof s === 'string' && s.trim() !== '' && s.trim() !== '[]'

function has(game: CompletenessInput, key: FieldKey): boolean {
  switch (key) {
    case 'cover': return filled(game.coverPath) || filled(game.coverUrl)
    case 'description': return filled(game.description)
    case 'score': return game.rawgScore !== null
    case 'year': return game.releaseYear !== null
    case 'genre': return filled(game.genre)
    case 'developer': return filled(game.developer)
    case 'publisher': return filled(game.publisher)
    case 'screenshots': return filled(game.screenshotPaths)
    case 'trailer': return filled(game.trailerUrl)
  }
}

export function completeness(game: CompletenessInput): { percent: number; missing: FieldKey[] } {
  let percent = 0
  const missing: FieldKey[] = []
  for (const f of FIELD_WEIGHTS) {
    if (has(game, f.key)) percent += f.weight
    else missing.push(f.key)
  }
  return { percent, missing }
}
