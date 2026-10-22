import { describe, it, expect } from 'vitest'
import { pickEditionKey, type Edition } from '@/lib/game-editions'

const ed = (key: string, region: string | null): Edition => ({ key, region, languages: [], fileSize: '0' })

describe('which region the game page starts on', () => {
  const editions = [ed('primary', 'USA'), ed('dlc-7', 'EUR'), ed('dlc-9', 'JPN')]

  it('follows the region the grid filter was set to', () => {
    expect(pickEditionKey(editions, 'JPN')).toBe('dlc-9')
  })

  it('defaults to EUR when nothing was requested', () => {
    expect(pickEditionKey(editions, null)).toBe('dlc-7')
  })

  it('ignores a requested region the game does not have', () => {
    expect(pickEditionKey(editions, 'FRA')).toBe('dlc-7')
  })

  it('falls back to the first edition when there is no EUR', () => {
    expect(pickEditionKey([ed('primary', 'USA'), ed('dlc-9', 'JPN')], undefined)).toBe('primary')
  })
})
