import { describe, it, expect } from 'vitest'
import { kindFromLaunchBox, artTitle, artKindOf } from '@/lib/art-catalog'
import { kindOf } from '@/lib/game-images'
import { pickBackdrop, pickLogo } from '@/lib/metadata/launchbox-art'
import type { LaunchBoxImage } from '@/lib/metadata/launchbox'

describe('LaunchBox categories in the data model', () => {
  it('stores every category under its catalogue kind, with the model name as title', () => {
    expect(kindOf('Box - Back')).toBe('box-back')
    expect(kindOf('Fanart - Box - Front')).toBe('fanart-box-front')
    expect(kindOf('Cart - Front')).toBe('cart-front')
    expect(kindOf('Disc')).toBe('disc')
    expect(kindOf('Screenshot - Game Select')).toBe('screenshot-game-select')
    expect(artTitle('box-3d')).toBe('Box - 3D')
    expect(artTitle('fanart')).toBe('Fanart - Background')
    expect(artTitle('clear-logo')).toBe('Clear Logo')
  })

  it('a category the catalogue does not know keeps its LaunchBox name', () => {
    expect(kindFromLaunchBox('Steam Background')).toBe('other:steam-background')
    expect(artTitle('other:steam-background')).toBe('Steam Background')
    expect(artKindOf('other:steam-background')).toBeNull()
  })

  it('old rows stored as other:<name> for catalogue categories still resolve to them', () => {
    expect(artTitle('other:fanart-box-front')).toBe('Fanart - Box - Front')
    expect(artKindOf('other:fanart-box-front')?.group).toBe('box')
  })
})

describe('banners that are wide enough', () => {
  it('a 16:9 banner is a banner (It Takes Two is 1200x675)', () => {
    const itt: LaunchBoxImage = { url: 'https://x/itt', type: 'Banner', width: 1200, height: 675 }
    expect(pickBackdrop([itt])?.kind).toBe('banner')
  })
  it('an upright banner still is not one', () => {
    const upright: LaunchBoxImage = { url: 'https://x/text', type: 'Banner', width: 600, height: 900 }
    expect(pickBackdrop([upright])).toBeNull()
  })
  it('the clear logo is picked as the game logo', () => {
    const logo: LaunchBoxImage = { url: 'https://x/logo', type: 'Clear Logo', width: 800, height: 400 }
    expect(pickLogo([logo])?.url).toBe('https://x/logo')
  })
})
