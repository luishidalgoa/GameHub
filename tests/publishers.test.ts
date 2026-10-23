import { describe, it, expect } from 'vitest'
import { publisherKey, rankGroups } from '@/lib/publishers'

describe('publisherKey', () => {
  it('folds spellings of one company together', () => {
    const keys = ['Ubisoft', 'Ubisoft Entertainment', 'Ubi Soft Entertainment Software'].map(publisherKey)
    expect(new Set(keys).size).toBe(1)
    expect(publisherKey('Activision Publishing')).toBe(publisherKey('Activision'))
    expect(publisherKey('Nintendo')).not.toBe(publisherKey('Sega'))
  })
  it('ignores case, accents and punctuation', () => {
    expect(publisherKey('Square Enix, Ltd.')).toBe(publisherKey('square enix'))
  })
})

describe('rankGroups', () => {
  const companies = [
    { id: 1, key: 'embracer', name: 'Embracer Group', parentId: null },
    { id: 2, key: 'thq', name: 'THQ', parentId: 1 },
    { id: 3, key: 'eidos', name: 'Eidos Interactive', parentId: 1 },
    { id: 4, key: 'nintendo', name: 'Nintendo', parentId: null },
  ]
  it('counts each company toward the owner at the top, and ranks by the sum of scores', () => {
    const ranked = rankGroups(companies, [
      { companyId: 2, games: 3, rated: 3, weight: 180 },
      { companyId: 3, games: 2, rated: 0, weight: 0 },
      { companyId: 4, games: 3, rated: 3, weight: 240 },
    ])
    expect(ranked.map(r => r.name)).toEqual(['Nintendo', 'Embracer Group'])
    expect(ranked[1]).toMatchObject({ key: 'embracer', games: 5, weight: 180 })
    expect(ranked[1].companyIds.sort()).toEqual([2, 3])
  })
  it('drops groups with too few scored games, and keeps them with minRated 0', () => {
    const totals = [{ companyId: 2, games: 1, rated: 1, weight: 90 }]
    expect(rankGroups(companies, totals)).toEqual([])
    expect(rankGroups(companies, totals, 0).map(r => r.key)).toEqual(['embracer'])
  })
})

describe('rankGroups keys', () => {
  it('lists the owner first, then the companies by games, so old art still finds the group', () => {
    const companies = [
      { id: 1, key: 'sony group', name: 'Sony Group', parentId: null },
      { id: 2, key: 'sony', name: 'Sony Computer Entertainment America', parentId: 1 },
      { id: 3, key: 'sony imagesoft', name: 'Sony Imagesoft', parentId: 1 },
    ]
    const [group] = rankGroups(companies, [
      { companyId: 2, games: 10, rated: 3, weight: 200 },
      { companyId: 3, games: 2, rated: 0, weight: 0 },
    ])
    expect(group.keys).toEqual(['sony group', 'sony', 'sony imagesoft'])
  })
})
