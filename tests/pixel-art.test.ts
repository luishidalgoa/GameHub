import { describe, it, expect } from 'vitest'
import { pixelScale } from '@/lib/pixel-art'

describe('pixelScale', () => {
  it('scales GBA and SNES snapshots by a whole number to at least 1280 px', () => {
    expect(pixelScale(240)).toBe(6)   // GBA: 1440
    expect(pixelScale(256)).toBe(5)   // SNES: 1280
    expect(pixelScale(160)).toBe(8)   // Game Boy: 1280
  })
  it('leaves big images alone and survives bad input', () => {
    expect(pixelScale(1920)).toBe(1)
    expect(pixelScale(0)).toBe(1)
    expect(pixelScale(NaN)).toBe(1)
  })
})
