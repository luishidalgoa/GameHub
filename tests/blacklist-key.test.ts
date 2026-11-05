import { describe, expect, it } from 'vitest'
import { torrentKeyOf } from '@/lib/games/torrent-key'

describe('torrentKeyOf', () => {
  it('reads a Switch catalog key, identity with colons included', () => {
    expect(torrentKeyOf('torrent:switch-games:id:010096500EA94000')).toEqual({ source: 'switch-games', identity: 'id:010096500EA94000' })
  })

  it('reads a legacy topic key', () => {
    expect(torrentKeyOf('torrent:minerva-snes:key:blt')).toEqual({ source: 'minerva-snes', identity: 'key:blt' })
  })

  it('returns null for local files and bare rows', () => {
    expect(torrentKeyOf('/mnt/Gamehub/Switch/Games/Mario.nsz')).toBeNull()
    expect(torrentKeyOf(null)).toBeNull()
    expect(torrentKeyOf('')).toBeNull()
  })
})
