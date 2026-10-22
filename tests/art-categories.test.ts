import { describe, it, expect } from 'vitest'
import { categoryOf, slotOf, isManualKind } from '@/lib/art-manual'
import { isPrivateAddress, parseRemoteUrl } from '@/lib/remote-image'

describe('which category an image belongs to', () => {
  it('sorts the LaunchBox kinds and the manual ones into the same categories', () => {
    expect(categoryOf('box-front')).toBe('cover')
    expect(categoryOf('banner')).toBe('banner')
    expect(categoryOf('manual-banner')).toBe('banner')
    expect(categoryOf('fanart')).toBe('fanart')
    expect(categoryOf('clear-logo')).toBe('logo')
    expect(categoryOf('manual-logo')).toBe('logo')
    expect(categoryOf('screenshot-gameplay')).toBe('screenshot')
    expect(categoryOf('manual-screenshot')).toBe('screenshot')
  })

  it('packaging, media and the rest have their own groups, and unknown LaunchBox categories are "other"', () => {
    expect(categoryOf('box-back')).toBe('box')
    expect(categoryOf('fanart-box-front')).toBe('box')
    expect(categoryOf('box-3d')).toBe('box')
    expect(categoryOf('cart-front')).toBe('media')
    expect(categoryOf('disc')).toBe('media')
    expect(categoryOf('square')).toBe('other')
    expect(categoryOf('advertisement-flyer-back')).toBe('other')
    expect(categoryOf('other:icon')).toBe('other')
    expect(categoryOf('other:fanart-box-front')).toBe('box')
  })

  it('only banner, fanart and logo fill a game art slot', () => {
    expect(slotOf('manual-fanart')).toBe('fanart')
    expect(slotOf('box-front')).toBeNull()
    expect(slotOf('screenshot-gameplay')).toBeNull()
  })

  it('only the owner\'s own images can be removed', () => {
    expect(isManualKind('manual-banner')).toBe(true)
    expect(isManualKind('banner')).toBe(false)
  })
})

describe('links the owner pastes', () => {
  it('accepts http and https links only, without credentials', () => {
    expect(parseRemoteUrl('https://example.com/a.png')?.hostname).toBe('example.com')
    expect(parseRemoteUrl('ftp://example.com/a.png')).toBeNull()
    expect(parseRemoteUrl('file:///etc/passwd')).toBeNull()
    expect(parseRemoteUrl('https://user:pass@example.com/a.png')).toBeNull()
    expect(parseRemoteUrl('not a link')).toBeNull()
  })

  it('refuses addresses inside the network', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.0.24', '172.20.1.1', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
      expect(isPrivateAddress(ip)).toBe(true)
    }
  })

  it('lets public addresses through', () => {
    for (const ip of ['8.8.8.8', '151.101.1.69', '2606:4700::1111']) {
      expect(isPrivateAddress(ip)).toBe(false)
    }
  })
})
