import { describe, expect, it } from 'vitest'
import { generateKeyPairSync, sign } from 'node:crypto'
import { parseNextendoCatalog } from '@/lib/online/nextendo'
import { comparableNames, normalizeGameTitle, parseOnlineProviders } from '@/lib/online/providers'
import { parsePretendoTitle, toBase3dsTitleId } from '@/lib/online/pretendo'

describe('parseNextendoCatalog', () => {
  // Un par de claves de prueba: la prueba firma con la privada y verifica con la pública.
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const publicB64 = (publicKey.export({ format: 'der', type: 'spki' }) as Buffer).subarray(-32).toString('base64')

  function envelope(doc: unknown, key = privateKey): string {
    const payload = Buffer.from(JSON.stringify(doc), 'utf8')
    const signature = sign(null, payload, key)
    return JSON.stringify({ key_id: 'catalog-key-1', payload: payload.toString('base64'), signature: signature.toString('base64') })
  }

  const doc = {
    document_type: 'game_catalog',
    schema_version: 1,
    revision: 16,
    expires_at: '2099-01-01T00:00:00Z',
    games: [
      { title_ids: ['01003fb00c5a8000'], name: 'Super Kirby Clash', enabled: true, versions: { policy: 'exact', accepted: ['1.0.1'], recommended: '1.0.1' } },
      { title_ids: ['01006a800016e000'], name: 'Super Smash Bros. Ultimate', enabled: false, versions: { policy: 'exact', recommended: '13.0.5' } },
      { title_ids: ['0100b0c013912000'], name: 'Among Us', enabled: true, versions: { policy: 'any' } },
    ],
  }

  it('reads each enabled game with its Title ID, recommended version and name', async () => {
    expect(await parseNextendoCatalog(envelope(doc), { publicKey: publicB64 })).toEqual([
      { titleId: '01003FB00C5A8000', status: 'compatible', requiredVersion: '1.0.1', name: 'Super Kirby Clash' },
      { titleId: '0100B0C013912000', status: 'compatible', requiredVersion: null, name: 'Among Us' },
    ])
  })

  it('rejects a catalog signed with another key', async () => {
    const other = generateKeyPairSync('ed25519').privateKey
    await expect(parseNextendoCatalog(envelope(doc, other), { publicKey: publicB64 })).rejects.toThrow('firma')
  })

  it('rejects an expired catalog and a document of another type', async () => {
    const expired = { ...doc, expires_at: '2020-01-01T00:00:00Z' }
    await expect(parseNextendoCatalog(envelope(expired), { publicKey: publicB64 })).rejects.toThrow('caducado')
    await expect(parseNextendoCatalog(envelope({ ...doc, document_type: 'other' }), { publicKey: publicB64 })).rejects.toThrow('otro tipo')
  })

  it('rejects a response that is not a signed envelope', async () => {
    await expect(parseNextendoCatalog('<html>not a catalog</html>', { publicKey: publicB64 })).rejects.toThrow()
  })
})

describe('parseOnlineProviders', () => {
  it('reads the platform list and drops malformed items', () => {
    const raw = '[{"key":"nextendo","label":"Nextendo Network","url":"https://github.com/NextendoNetwork"},{"key":"x"}]'
    expect(parseOnlineProviders(raw)).toEqual([
      { key: 'nextendo', label: 'Nextendo Network', url: 'https://github.com/NextendoNetwork' },
    ])
  })

  it('returns nothing when the value is empty, not a list, or broken', () => {
    expect(parseOnlineProviders(null)).toEqual([])
    expect(parseOnlineProviders('{"key":"nextendo"}')).toEqual([])
    expect(parseOnlineProviders('[nope')).toEqual([])
  })
})

describe('normalizeGameTitle', () => {
  it('matches a library title with the source name, whatever its region tag or accents', () => {
    expect(normalizeGameTitle('Splatoon 2 (EU)')).toBe(normalizeGameTitle('Splatoon 2'))
    expect(normalizeGameTitle('Pokémon Sword')).toBe(normalizeGameTitle('Pokemon Sword'))
    expect(normalizeGameTitle('Diablo III: Eternal Collection')).toBe(normalizeGameTitle('Diablo III Eternal Collection'))
    expect(normalizeGameTitle('Game Boy - Nintendo Switch Online')).toBe(normalizeGameTitle('Game Boy'))
  })

  it('keeps different games apart', () => {
    expect(normalizeGameTitle('Pokémon Sword')).not.toBe(normalizeGameTitle('Pokémon Shield'))
  })
})

describe('parsePretendoTitle', () => {
  const file = `
export default class MarioKart7 extends Title {
	public static displayName = 'MARIO KART 7';
	public static titleIDs = [
		'0004000000030600',
		'0004000000030700',
		'0004000E00030600',
		'0005000010112300',
	];
}`
  it('reads the display name and the 3DS title IDs, updates folded into the base game', () => {
    expect(parsePretendoTitle(file)).toEqual({
      name: 'MARIO KART 7',
      titleIds: ['0004000000030600', '0004000000030700'],
    })
  })

  it('returns no IDs for a file without the list', () => {
    expect(parsePretendoTitle("public static displayName = 'Nothing';")).toEqual({ name: 'Nothing', titleIds: [] })
  })

  it('recognises only 3DS base IDs as 3DS', () => {
    expect(toBase3dsTitleId('0004008C00030600')).toBe('00040000' + '00030600')
    expect(toBase3dsTitleId('0005000010112300')).toBeNull()
  })
})

describe('comparableNames', () => {
  it('splits a name with a slash into the two games it covers', () => {
    expect(comparableNames('Pokémon X/Y')).toEqual([normalizeGameTitle('Pokémon X'), normalizeGameTitle('Pokémon Y')])
    expect(comparableNames('Pokémon Omega Ruby/Alpha Sapphire')).toEqual([
      normalizeGameTitle('Pokémon Omega Ruby'),
      normalizeGameTitle('Pokémon Alpha Sapphire'),
    ])
  })

  it('keeps a plain name as it is', () => {
    expect(comparableNames('Mario Kart 7')).toEqual(['mario kart 7'])
  })
})
