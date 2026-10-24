import { describe, expect, it } from 'vitest'
import { orderFeatured, parseFeaturedOrder } from '@/lib/featured-order'

function row(title: string, rawgScore: number | null, featuredOrder: number | null = null) {
  return { title, rawgScore, featuredOrder }
}

describe('parseFeaturedOrder', () => {
  it('accepts whole numbers from 1 to 99, typed or as text', () => {
    expect(parseFeaturedOrder(1)).toBe(1)
    expect(parseFeaturedOrder('6')).toBe(6)
    expect(parseFeaturedOrder(99)).toBe(99)
  })

  it('reads an empty or invalid value as automatic order', () => {
    expect(parseFeaturedOrder('')).toBeNull()
    expect(parseFeaturedOrder(null)).toBeNull()
    expect(parseFeaturedOrder(undefined)).toBeNull()
    expect(parseFeaturedOrder(0)).toBeNull()
    expect(parseFeaturedOrder(100)).toBeNull()
    expect(parseFeaturedOrder(2.5)).toBeNull()
    expect(parseFeaturedOrder('abc')).toBeNull()
  })
})

describe('orderFeatured', () => {
  it('puts pinned games first, by their number', () => {
    const out = orderFeatured([row('A', 90), row('B', 70, 2), row('C', 60, 1)])
    expect(out.map(g => g.title)).toEqual(['C', 'B', 'A'])
  })

  it('keeps the rest in score order after the pinned ones', () => {
    const out = orderFeatured([row('Low', 50), row('High', 95), row('Pinned', 10, 3), row('Mid', 70)])
    expect(out.map(g => g.title)).toEqual(['Pinned', 'High', 'Mid', 'Low'])
  })

  it('breaks a tie between equal numbers by score', () => {
    const out = orderFeatured([row('A', 60, 1), row('B', 80, 1)])
    expect(out.map(g => g.title)).toEqual(['B', 'A'])
  })

  it('treats a missing score as the lowest', () => {
    const out = orderFeatured([row('NoScore', null), row('Score', 40)])
    expect(out.map(g => g.title)).toEqual(['Score', 'NoScore'])
  })

  it('does not change the array it receives', () => {
    const input = [row('A', 10), row('B', 90)]
    orderFeatured(input)
    expect(input.map(g => g.title)).toEqual(['A', 'B'])
  })
})
