import { describe, it, expect } from 'vitest'
import { tileColors, hueFromName } from '@/lib/publisher-art'

describe('tileColors', () => {
  it('uses the logo brand color when it has one', () => {
    const [a] = tileColors(['#e60012'], 'Nintendo')   // Nintendo red
    const n = parseInt(a.slice(1), 16)
    expect(n >> 16).toBeGreaterThan(n & 255)          // still red-dominant
  })
  it('falls back to a stable hue from the name for gray or black logos', () => {
    expect(tileColors(['#101010', '#eeeeee'], 'Konami')).toEqual(tileColors([], 'Konami'))
    expect(hueFromName('Konami')).toBe(hueFromName('Konami'))
    expect(tileColors([], 'Konami')).not.toEqual(tileColors([], 'Sega'))
  })
  it('always returns two colors', () => {
    expect(tileColors([], 'X')).toHaveLength(2)
  })
})

import { knockOutBackground } from '@/lib/publisher-art'

describe('knockOutBackground', () => {
  it('makes the commonest color transparent and keeps the lettering', () => {
    const px = (r: number, g: number, b: number, n: number) => Array.from({ length: n }, () => [r, g, b]).flat()
    const rgb = new Uint8Array([...px(224, 0, 0, 90), ...px(255, 255, 255, 10)])   // red box, white letters
    const out = knockOutBackground(rgb, 3)
    expect(out[3]).toBe(0)                    // a red pixel
    expect(out[(95) * 4 + 3]).toBe(255)       // a white pixel
  })
})
