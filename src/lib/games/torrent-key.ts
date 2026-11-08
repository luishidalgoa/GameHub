// The catalog identity of a torrent game. Pure, so the client and the tests can read a
// key without the database: `torrent:<source>:<identity>`, where the identity may itself
// contain colons (`id:0100…`, `key:blt`).

const KEY = /^torrent:([^:]+):(.+)$/

export interface TorrentKey { source: string; identity: string }

/** The catalog identity of a game's key, or null for a local game or a bare row. */
export function torrentKeyOf(externalKey: string | null): TorrentKey | null {
  const m = externalKey ? KEY.exec(externalKey) : null
  return m ? { source: m[1], identity: m[2] } : null
}

const GB_CONSOLES = ['gb', 'gbc', 'gba'] as const

/** Consola de Game Boy de una fuente («minerva-gbc» → «gbc»), o null si la fuente no es de una. */
export function consoleOfSource(source: string): string | null {
  const c = source.replace(/^minerva-/, '')
  return (GB_CONSOLES as readonly string[]).includes(c) ? c : null
}

/**
 * Identidad de un juego sin Title ID. En Game Boy el mismo título existe en GB, GBC y GBA y no es el
 * mismo juego: GB y GBC llevan su consola en la identidad; GBA conserva la de siempre.
 * Un nombre corto (p. ej. «16t») cuenta igual que uno largo: sus variantes de un mismo archivo
 * torrent son una sola fila por plataforma. Solo un nombre vacío cae en la identidad del topic.
 */
export function identityOf(e: { titleId: string | null; titleKey: string; source: string; sourceKey: string }): string {
  if (e.titleId) return `id:${e.titleId}`
  if (e.titleKey.length > 0) {
    const console = consoleOfSource(e.source)
    return `key:${console && console !== 'gba' ? `${console}:` : ''}${e.titleKey}`
  }
  return `topic:${e.source}:${e.sourceKey}`
}
