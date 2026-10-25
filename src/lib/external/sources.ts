/**
 * Registro de fuentes externas de torrents. Cada fuente pertenece a una plataforma y sabe
 * cómo obtener sus entradas (JSON, HTML, etc.). Una plataforma sin fuentes no tiene torrents;
 * añadir una fuente nueva es añadir una entrada a TORRENT_SOURCES. La clave no puede contener «:».
 */
import { JsonSourceProvider } from './providers/json-provider'
import { MinervaDirectoryProvider } from './providers/minerva-provider'
import type { ExternalSourceProvider, RawEntry } from './providers/types'

export type { RawEntry } from './providers/types'
export type { ExternalSourceProvider }

export interface TorrentSource {
  key: string
  platformSlug: string
  label: string
  provider: ExternalSourceProvider
}

export const TORRENT_SOURCES: TorrentSource[] = [
  // Nintendo Switch — lista JSON mantenida en GitHub
  {
    key: 'switch-games',
    platformSlug: 'switch',
    label: 'Langegen/switch-games (RuTracker)',
    provider: new JsonSourceProvider(
      'https://raw.githubusercontent.com/Langegen/switch-games/main/switch_games.json',
      raw => {
        if (!Array.isArray(raw)) throw new Error('la fuente no es una lista')
        return raw as RawEntry[]
      },
    ),
  },
  // Sony PSP — PSN digital (decrypted), No-Intro
  {
    key: 'minerva-psp',
    platformSlug: 'psp',
    label: 'Minerva Archive · PSP (No-Intro PSN Decrypted)',
    provider: new MinervaDirectoryProvider(
      'https://minerva-archive.org/browse/No-Intro/Sony%20-%20PlayStation%20Portable%20(PSN)%20(Decrypted)/',
    ),
  },
  // PS Vita — PSN content (NoIntro)
  {
    key: 'minerva-psvita',
    platformSlug: 'psvita',
    label: 'Minerva Archive · PS Vita (No-Intro PSN Content)',
    provider: new MinervaDirectoryProvider(
      'https://minerva-archive.org/browse/No-Intro/Sony%20-%20PlayStation%20Vita%20(PSN)%20(Content)/',
    ),
  },
  // PS1 — Redump (se omite si la plataforma «ps1» no existe en la base de datos)
  {
    key: 'minerva-ps1',
    platformSlug: 'ps1',
    label: 'Minerva Archive · PS1 (Redump)',
    provider: new MinervaDirectoryProvider(
      'https://minerva-archive.org/browse/Redump/Sony%20-%20PlayStation/',
    ),
  },
  // PS2 — Redump (se omite si la plataforma «ps2» no existe en la base de datos)
  {
    key: 'minerva-ps2',
    platformSlug: 'ps2',
    label: 'Minerva Archive · PS2 (Redump)',
    provider: new MinervaDirectoryProvider(
      'https://minerva-archive.org/browse/Redump/Sony%20-%20PlayStation%202/',
    ),
  },
]

/** Las fuentes de una plataforma, o de todas cuando no se indica ninguna. */
export function torrentSourcesFor(platformSlug?: string): TorrentSource[] {
  return platformSlug ? TORRENT_SOURCES.filter(s => s.platformSlug === platformSlug) : TORRENT_SOURCES
}

/** Orden de preferencia entre fuentes de un mismo juego: la primera del registro gana. */
export function sourcePriority(key: string): number {
  const i = TORRENT_SOURCES.findIndex(s => s.key === key)
  return i < 0 ? Number.MAX_SAFE_INTEGER : i
}
