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

  it('everything else is "other", including unknown LaunchBox categories', () => {
    for (const k of ['box-back', 'box-3d', 'cart-front', 'disc', 'square', 'other:icon']) {
      expect(categoryOf(k)).toBe('other')
    }
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
