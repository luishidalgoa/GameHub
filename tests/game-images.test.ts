import { describe, it, expect } from 'vitest'
import { kindOf } from '@/lib/game-images'

describe('kindOf', () => {
  it('normalizes LaunchBox categories', () => {
    expect(kindOf('Banner')).toBe('banner')
    expect(kindOf('Fanart - Background')).toBe('fanart')
    expect(kindOf('Box - Front')).toBe('box-front')
    expect(kindOf('Box - 3D')).toBe('box-3d')
    expect(kindOf('Box - Front - Reconstructed')).toBe('box-front-reconstructed')
    expect(kindOf('Screenshot - Game Title')).toBe('screenshot-game-title')
    expect(kindOf('Clear Logo')).toBe('clear-logo')
  })
  it('keeps unknown categories as other', () => {
    expect(kindOf('Something New')).toBe('other')
  })
})
