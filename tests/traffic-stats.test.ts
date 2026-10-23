import { describe, expect, it } from 'vitest'
import { countByDay, dayStarts, errorPercent, successPercent } from '@/lib/traffic-stats'

describe('successPercent', () => {
  it('is null when nothing has closed yet', () => {
    expect(successPercent(0, 0)).toBeNull()
  })

  it('divides finished rows by closed rows', () => {
    expect(successPercent(8, 2)).toBe(80)
    expect(successPercent(3, 0)).toBe(100)
  })
})

describe('errorPercent', () => {
  it('is null without requests, so a quiet hour is not shown as healthy', () => {
    expect(errorPercent(0, 0)).toBeNull()
  })

  it('keeps one decimal', () => {
    expect(errorPercent(200, 2)).toBe(1)
    expect(errorPercent(3, 1)).toBe(33.3)
  })
})

describe('dayStarts', () => {
  it('returns the last N local days, oldest first, today last', () => {
    const now = new Date(2026, 9, 23, 15, 30)
    const days = dayStarts(now, 3)
    expect(days.map((d) => d.getDate())).toEqual([21, 22, 23])
    expect(days[2].getHours()).toBe(0)
  })
})

describe('countByDay', () => {
  const now = new Date(2026, 9, 23, 12)
  const starts = dayStarts(now, 3)

  it('counts timestamps inside each day', () => {
    const dates = [
      new Date(2026, 9, 21, 9),
      new Date(2026, 9, 21, 23),
      new Date(2026, 9, 23, 1),
    ]
    expect(countByDay(dates, starts, new Date(2026, 9, 20))).toEqual([2, 0, 1])
  })

  it('marks days before the oldest kept row as null, not zero', () => {
    const dates = [new Date(2026, 9, 22, 10)]
    expect(countByDay(dates, starts, new Date(2026, 9, 22, 0))).toEqual([null, 1, 0])
  })

  it('returns all null when there are no rows at all', () => {
    expect(countByDay([], starts, null)).toEqual([null, null, null])
  })
})
