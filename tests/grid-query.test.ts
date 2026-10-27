import { describe, it, expect } from 'vitest'
import { gridFiltersFromQuery, gridFiltersToQuery, safeReturnPath, type GridFilters } from '@/lib/games/grid-query'

const DEFAULTS: GridFilters = {
  search: '', sort: 'title', favOnly: false, onlineOnly: false,
  origin: '', region: '', genre: '', minRating: '',
}

const read = (qs: string) => gridFiltersFromQuery(new URLSearchParams(qs))

describe('grid filters in the URL', () => {
  it('the default view has no query string', () => {
    expect(gridFiltersToQuery(DEFAULTS)).toBe('')
    expect(read('')).toEqual(DEFAULTS)
  })

  it('round-trips every filter', () => {
    const f: GridFilters = {
      search: 'Zelda', sort: 'year', favOnly: true, onlineOnly: true,
      origin: 'torrent', region: 'EUR', genre: 'RPG', minRating: '80',
    }
    expect(read(gridFiltersToQuery(f))).toEqual(f)
  })

  it('falls back to the default for unknown sort and origin values', () => {
    const f = read('sort=hacked&source=elsewhere')
    expect(f.sort).toBe('title')
    expect(f.origin).toBe('')
  })

  it('caps free text so a long query string cannot grow without limit', () => {
    expect(read('q=' + 'a'.repeat(500)).search).toHaveLength(120)
  })

  it('only the exact value "1" turns a toggle on', () => {
    expect(read('fav=true').favOnly).toBe(false)
    expect(read('fav=1').favOnly).toBe(true)
  })
})

describe('safeReturnPath', () => {
  it('accepts a path on this site, with its query', () => {
    expect(safeReturnPath('/platform/switch?q=zelda&fav=1')).toBe('/platform/switch?q=zelda&fav=1')
    expect(safeReturnPath('/admin/games?page=2')).toBe('/admin/games?page=2')
  })

  it.each([
    ['protocol-relative', '//evil.example/x'],
    ['absolute', 'https://evil.example/'],
    ['backslash trick', '/\\evil.example'],
    ['line break', '/platform/switch\r\nSet-Cookie: x'],
    ['not a path', 'platform/switch'],
    ['empty', ''],
    ['missing', null],
  ])('refuses a %s target', (_name, value) => {
    expect(safeReturnPath(value as string | null)).toBeNull()
  })
})
