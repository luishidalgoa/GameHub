// What the admin sees of the metadata chain: for each platform, the order in which
// the sources are consulted and whether each one can answer for that platform at all.
// The order below mirrors gatherMetadata (compose.ts), the score chain (scoreChain.ts)
// and the batch outcomes (batch.ts). If one of those changes, change this with it.

import type { ProviderMatrix } from './matrix'
import { LAUNCHBOX_PLATFORM_NAMES } from './launchbox'
import { RAWG_PLATFORM_SLUGS } from './rawg'
import { METACRITIC_PLATFORM_SLUGS } from './metacritic'
import { libretroSystemsFor } from './libretro'
import { GAME_BOY_SLUG } from './platform-console'

export type StepState = 'ready' | 'missing' | 'na'

export interface ChainStep {
  id:     string
  title:  string
  detail: string
  state:  StepState
}

/** Which sources can answer for a platform at all, from the maps in the code. */
export interface SourceReadiness {
  launchbox:  boolean
  rawg:       boolean
  metacritic: boolean
  libretro:   boolean
  store:      boolean
}

export interface PlatformChain {
  slug:      string
  name:      string
  matrix:    ProviderMatrix
  sources:   SourceReadiness
  steps:     ChainStep[]
}

const SOURCE_LABEL: Record<string, string> = {
  launchbox:   'LaunchBox',
  rawg:        'RAWG',
  steamgriddb: 'SteamGridDB',
  libretro:    'libretro',
}

export function sourcesFor(slug: string): SourceReadiness {
  return {
    // Game Boy is one platform for three LaunchBox consoles (launchbox.ts special case).
    launchbox:  slug === GAME_BOY_SLUG || Boolean(LAUNCHBOX_PLATFORM_NAMES[slug]),
    rawg:       Boolean(RAWG_PLATFORM_SLUGS[slug]),
    // Game Boy's Metacritic page depends on the game's own console (gb, gbc or gba).
    metacritic: slug === GAME_BOY_SLUG || Boolean(METACRITIC_PLATFORM_SLUGS[slug]),
    libretro:   libretroSystemsFor(slug).length > 0,
    store:      slug === 'switch',
  }
}

export function chainFor(input: { slug: string; name: string; matrix: ProviderMatrix }): PlatformChain {
  const { slug, name, matrix } = input
  const sources = sourcesFor(slug)
  const field = (f: keyof ProviderMatrix) => SOURCE_LABEL[matrix[f]] ?? matrix[f]

  const steps: ChainStep[] = [
    {
      id: 'launchbox', title: 'Ficha · LaunchBox',
      detail: sources.launchbox
        ? 'Busca por título dentro de la plataforma de LaunchBox.'
        : 'Sin nombre de plataforma en LaunchBox: no se consulta. Hay que añadir el alias.',
      state: sources.launchbox ? 'ready' : 'missing',
    },
    {
      id: 'rawg', title: 'Ficha · RAWG',
      detail: sources.rawg
        ? 'Busca por título y comprueba la consola en RAWG.'
        : 'Sin mapeo a RAWG: busca solo por título, sin comprobar la consola.',
      state: sources.rawg ? 'ready' : 'missing',
    },
    {
      id: 'store', title: 'Ficha · tienda de Nintendo',
      detail: sources.store ? 'Primera para Switch, sin umbral de coincidencia.' : 'No aplica fuera de Switch.',
      state: sources.store ? 'ready' : 'na',
    },
    {
      id: 'libretro-cover', title: 'Portada sola · libretro',
      detail: sources.libretro
        ? 'Solo si ninguna fuente de ficha responde: la caja de la consola por nombre de fichero.'
        : 'La consola no está en libretro: no hay portada de respaldo.',
      state: sources.libretro ? 'ready' : 'na',
    },
    {
      id: 'no-match', title: 'Sin ficha · no_match',
      detail: 'Reintento a los 14 días. Motivo: plataforma sin mapeo, sin resultados o bajo el umbral de 68.',
      state: 'ready',
    },
    {
      id: 'provider-error', title: 'Caída de una fuente · provider_error',
      detail: 'Reintento de 1 a 24 horas. Una caída nunca cuenta como «sin ficha».',
      state: 'ready',
    },
    {
      id: 'wikidata', title: 'Después · Wikidata',
      detail: 'Rellena desarrollador, editor, año y género vacíos. No cambia el estado del juego.',
      state: 'ready',
    },
    {
      id: 'score', title: 'Puntuación',
      detail: [
        'RAWG metacritic',
        sources.metacritic ? 'Metacritic (página de la plataforma)' : 'Metacritic sin página para esta consola',
        'valoración de LaunchBox',
      ].join(' → '),
      state: sources.metacritic ? 'ready' : 'missing',
    },
    {
      id: 'fields', title: 'Fuente primaria por campo',
      detail: `Portada: ${field('cover')} · Info: ${field('info')} · Descripción: ${field('description')} · Capturas: ${field('screenshots')}`,
      state: 'ready',
    },
  ]

  return { slug, name, matrix, sources, steps }
}
