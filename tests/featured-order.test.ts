import { describe, expect, it } from 'vitest'
import { chooseHome, describeSlot, orderFeatured, parseFeaturedOrder } from '@/lib/featured-order'

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

describe('chooseHome', () => {
  const game = (id: number, rawgScore: number | null, featuredOrder: number | null = null) =>
    ({ id, rawgScore, featuredOrder })
  const popular = [game(10, 90), game(11, 80), game(12, 70), game(13, 60), game(14, 50), game(15, 40), game(16, 30)]

  it('starts the hero with the picks in their order, then the popular games', () => {
    const picks = [game(1, 50, 2), game(2, 40, 1)]
    const { hero } = chooseHome(picks, popular, { hero: 5, wall: 6 })
    expect(hero.map(g => g.id)).toEqual([2, 1, 10, 11, 12])
  })

  it('shows the picks that do not fit the hero in the wall, ahead of the rest', () => {
    const picks = [1, 2, 3, 4, 5, 6, 7].map(id => game(id, 50, id))
    const { hero, wall } = chooseHome(picks, popular, { hero: 5, wall: 6 })
    expect(hero.map(g => g.id)).toEqual([1, 2, 3, 4, 5])
    expect(wall.map(g => g.id)).toEqual([6, 7, 10, 11, 12, 13])
  })

  it('fills both with the best-rated games when there are no picks', () => {
    const { hero, wall } = chooseHome([], popular, { hero: 5, wall: 6 })
    expect(hero.map(g => g.id)).toEqual([10, 11, 12, 13, 14])
    expect(wall.map(g => g.id)).toEqual([15, 16])
  })

  it('never repeats a game between the hero and the wall', () => {
    const picks = [game(1, 99, 1), game(2, 98, 2)]
    const { hero, wall } = chooseHome(picks, popular, { hero: 5, wall: 6 })
    const ids = [...hero, ...wall].map(g => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('describeSlot', () => {
  const picks = [
    { id: 1, title: 'Undertale', featuredOrder: 2 },
    { id: 2, title: 'Minecraft', featuredOrder: null },
    { id: 3, title: 'Pokémon X', featuredOrder: 4 },
  ]

  it('finds no occupant for a free slot or an automatic choice', () => {
    expect(describeSlot(picks, 2, 5, null)).toEqual({ occupant: null, swapTo: null })
    expect(describeSlot(picks, 2, null, 2)).toEqual({ occupant: null, swapTo: null })
  })

  it('reports who holds the slot and where they go on save', () => {
    expect(describeSlot(picks, 2, 2, 4)).toEqual({ occupant: picks[0], swapTo: 4 })
  })

  it('sends the occupant to automatic when this game had no slot', () => {
    expect(describeSlot(picks, 2, 2, null)).toEqual({ occupant: picks[0], swapTo: null })
  })

  it('treats the game’s own slot as free', () => {
    expect(describeSlot(picks, 1, 2, 2)).toEqual({ occupant: null, swapTo: null })
  })
})
