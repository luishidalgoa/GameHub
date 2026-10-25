import { describe, expect, it } from 'vitest'
import { parseNextendoTitles } from '@/lib/online/nextendo'
import { parseOnlineProviders } from '@/lib/online/providers'

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
