import { describe, expect, it } from 'vitest'
import { filterByTag, sourceConfigError } from '@/lib/external/source-types'

const entries = [
  { title: 'Donkey Kong Bananza [NUP][RUS/Multi17]' },
  { title: 'Moadra [NSZ][RUS/Multi9]' },
  { title: 'Mario Kart World [nup][ENG]' },
]

describe('filterByTag', () => {
  it('keeps only the entries carrying the tag, case-insensitively', () => {
    expect(filterByTag(entries, { onlyTag: 'NUP' }).map(e => e.title)).toEqual([
      'Donkey Kong Bananza [NUP][RUS/Multi17]',
      'Mario Kart World [nup][ENG]',
    ])
  })

  it('drops the entries carrying the tag when it is an exception', () => {
    expect(filterByTag(entries, { exceptTag: 'NUP' }).map(e => e.title)).toEqual(['Moadra [NSZ][RUS/Multi9]'])
  })

  it('returns the whole source when there is no tag', () => {
    expect(filterByTag(entries, {})).toHaveLength(3)
  })

  it('matches the whole bracketed tag, not a substring of another one', () => {
    expect(filterByTag([{ title: 'Game [NUPX]' }], { onlyTag: 'NUP' })).toEqual([])
  })

  it('treats a missing title as not carrying the tag', () => {
    expect(filterByTag([{ title: undefined }], { onlyTag: 'NUP' })).toEqual([])
    expect(filterByTag([{ title: undefined }], { exceptTag: 'NUP' })).toHaveLength(1)
  })
})

describe('sourceConfigError with tags', () => {
  const base = { key: 'switch-games-nup', type: 'json-list' as const, url: 'https://raw.githubusercontent.com/a/b/main/c.json', enabled: true }

  it('accepts a valid onlyTag and a valid exceptTag', () => {
    expect(sourceConfigError({ ...base, onlyTag: 'NUP' })).toBeNull()
    expect(sourceConfigError({ ...base, exceptTag: 'NUP' })).toBeNull()
  })

  it('rejects a tag with brackets or spaces', () => {
    expect(sourceConfigError({ ...base, onlyTag: '[NUP]' })).not.toBeNull()
    expect(sourceConfigError({ ...base, exceptTag: 'NU P' })).not.toBeNull()
  })

  it('rejects onlyTag and exceptTag together', () => {
    expect(sourceConfigError({ ...base, onlyTag: 'NUP', exceptTag: 'NSZ' })).not.toBeNull()
  })
})
