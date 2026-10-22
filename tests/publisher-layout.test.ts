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
