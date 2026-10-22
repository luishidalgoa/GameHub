import { describe, it, expect } from 'vitest'
import { cleanLayout } from '@/lib/publisher-art'

describe('the owner\'s arrangement of a publisher tile', () => {
  it('keeps known elements, with their centre and width', () => {
    expect(cleanLayout({ character: { x: 40, y: 50, w: 80 }, logo: { x: 50, y: 90, w: 40 } }))
      .toEqual({ character: { x: 40, y: 50, w: 80 }, logo: { x: 50, y: 90, w: 40 } })
  })
  it('keeps the values inside the tile', () => {
    expect(cleanLayout({ logo: { x: -10, y: 140, w: 1000 } })).toEqual({ logo: { x: 0, y: 100, w: 200 } })
  })
  it('drops what is not a place and any other key', () => {
    expect(cleanLayout({ character: { x: 'a', y: 1, w: 1 }, evil: { x: 1, y: 1, w: 1 } })).toEqual({})
    expect(cleanLayout(null)).toEqual({})
    expect(cleanLayout('not an object')).toEqual({})
  })
})

describe('a box with a height', () => {
  it('keeps a crop box (both sides) and a logo with only a height', () => {
    expect(cleanLayout({ character: { x: 50, y: 42, w: 84, h: 66 }, logo: { x: 50, y: 88.9, h: 11.1 } }))
      .toEqual({ character: { x: 50, y: 42, w: 84, h: 66 }, logo: { x: 50, y: 88.9, h: 11.1 } })
  })
  it('a place with neither a width nor a height is dropped', () => {
    expect(cleanLayout({ logo: { x: 50, y: 50 } })).toEqual({})
  })
})
