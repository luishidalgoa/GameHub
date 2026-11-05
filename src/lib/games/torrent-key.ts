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
