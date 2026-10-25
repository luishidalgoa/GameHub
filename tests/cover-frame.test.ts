import { describe, expect, it } from 'vitest'
import { parseCoverFrame, serializeCoverFrame } from '@/lib/cover-frame'

describe('parseCoverFrame', () => {
  it('reads a frame from JSON text or from an object', () => {
    expect(parseCoverFrame('{"x":0.1,"y":0.2,"s":0.5}')).toEqual({ x: 0.1, y: 0.2, s: 0.5 })
    expect(parseCoverFrame({ x: 0, y: 0, s: 1 })).toEqual({ x: 0, y: 0, s: 1 })
  })

  it('rejects broken JSON, missing values and non-numbers', () => {
    expect(parseCoverFrame('{nope')).toBeNull()
    expect(parseCoverFrame({ x: 0, y: 0 })).toBeNull()
    expect(parseCoverFrame({ x: '0', y: 0, s: 1 })).toBeNull()
    expect(parseCoverFrame(null)).toBeNull()
  })

  it('rejects a frame that leaves the platform frame or is too small', () => {
    expect(parseCoverFrame({ x: 0.6, y: 0, s: 0.5 })).toBeNull()
    expect(parseCoverFrame({ x: 0, y: 0, s: 0.05 })).toBeNull()
    expect(parseCoverFrame({ x: -0.1, y: 0, s: 0.5 })).toBeNull()
    expect(parseCoverFrame({ x: 0, y: 0, s: 1.2 })).toBeNull()
  })
})

describe('serializeCoverFrame', () => {
  it('stores nothing when there is no frame', () => {
    expect(serializeCoverFrame(null)).toBeNull()
    expect(parseCoverFrame(serializeCoverFrame({ x: 0.25, y: 0.5, s: 0.5 }))).toEqual({ x: 0.25, y: 0.5, s: 0.5 })
  })
})
