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
