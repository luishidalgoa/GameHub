import { describe, expect, it } from 'vitest'
import { goalProgress, parseGoal, quarterOf } from '@/lib/donations/goal'

describe('quarterOf', () => {
  it('returns the calendar quarter that holds the date', () => {
    const q = quarterOf(new Date('2026-10-23T12:00:00Z'))
    expect(q.label).toBe('T4 2026')
    expect(q.start.toISOString()).toBe('2026-10-01T00:00:00.000Z')
    expect(q.end.toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })

  it('starts the first quarter in January and the second in April', () => {
    expect(quarterOf(new Date('2026-01-01T00:00:00Z')).label).toBe('T1 2026')
    expect(quarterOf(new Date('2026-04-01T00:00:00Z')).start.toISOString()).toBe('2026-04-01T00:00:00.000Z')
  })
})

describe('parseGoal', () => {
  it('reads a positive amount, accepting a decimal comma', () => {
    expect(parseGoal('150')).toBe(150)
    expect(parseGoal(' 12,5 ')).toBe(12.5)
  })

  it('treats unset, zero, negative and non-numeric values as no goal', () => {
    expect(parseGoal(null)).toBeNull()
    expect(parseGoal('')).toBeNull()
    expect(parseGoal('0')).toBeNull()
    expect(parseGoal('-20')).toBeNull()
    expect(parseGoal('abc')).toBeNull()
  })
})

describe('goalProgress', () => {
  it('fills one layer below the goal', () => {
    const p = goalProgress(50, 200)
    expect(p.percent).toBe(25)
    expect(p.firstLayer).toBe(25)
    expect(p.secondLayer).toBe(0)
  })

  it('fills the first layer completely and starts the second once the goal is passed', () => {
    const p = goalProgress(300, 200)
    expect(p.percent).toBe(150)
    expect(p.firstLayer).toBe(100)
    expect(p.secondLayer).toBe(50)
  })

  it('stops the second layer at full beyond 200 %', () => {
    const p = goalProgress(500, 200)
    expect(p.percent).toBe(250)
    expect(p.secondLayer).toBe(100)
  })

  it('rounds the percent down, so 99.9 % does not show as complete', () => {
    expect(goalProgress(199.9, 200).percent).toBe(99)
  })
})
