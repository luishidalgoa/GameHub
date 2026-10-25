import { describe, expect, it } from 'vitest'
import { parseNextendoTitles } from '@/lib/online/nextendo'
import { normalizeGameTitle, parseOnlineProviders } from '@/lib/online/providers'
import { parsePretendoTitle, toBase3dsTitleId } from '@/lib/online/pretendo'

describe('parseNextendoTitles', () => {
  it('reads each title with its Title ID, required version and name', () => {
    const text = [
      '        {0x0100152000022000, "4.0.1"},  // Mario Kart 8 Deluxe',
      '        {0x0100F8F0000A2000, "5.5.2"},  // Splatoon 2 (EU)',
      '    static const x = 1;',
    ].join('\n')
    expect(parseNextendoTitles(text)).toEqual([
      { titleId: '0100152000022000', status: 'compatible', requiredVersion: '4.0.1', name: 'Mario Kart 8 Deluxe' },
      { titleId: '0100F8F0000A2000', status: 'compatible', requiredVersion: '5.5.2', name: 'Splatoon 2 (EU)' },
    ])
  })

  it('keeps an entry without a name and skips lines that are not entries', () => {
    const out = parseNextendoTitles('{0x01006a800016e000, "13.0.5"},\n// comentario sin entrada')
    expect(out).toEqual([{ titleId: '01006A800016E000', status: 'compatible', requiredVersion: '13.0.5', name: null }])
  })

  it('returns nothing for a file without the table', () => {
    expect(parseNextendoTitles('<html>not a table</html>')).toEqual([])
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
