import { describe, expect, it } from 'vitest'
import { pageListsPlatform } from '@/lib/metadata/metacritic'

function page(gamePlatform: unknown): string {
  const ld = JSON.stringify({ '@type': 'VideoGame', name: 'Inazuma Eleven', gamePlatform })
  return `<html><head><script type="application/ld+json">${ld}</script></head><body></body></html>`
}

describe('pageListsPlatform', () => {
  it('accepts a merged page that lists the requested platform', () => {
    expect(pageListsPlatform(page(['DS', '3DS']), '3DS')).toBe(true)
  })

  it('accepts a single platform given as a string', () => {
    expect(pageListsPlatform(page('3DS'), '3DS')).toBe(true)
  })

  it('matches a platform whatever the maker prefix is ("Nintendo Switch" is "Switch")', () => {
    expect(pageListsPlatform(page(['Nintendo Switch']), 'Switch')).toBe(true)
    expect(pageListsPlatform(page(['Nintendo DS']), 'DS')).toBe(true)
  })

  it('rejects a page that lists only other platforms (a port or another version)', () => {
    expect(pageListsPlatform(page(['iOS']), '3DS')).toBe(false)
    expect(pageListsPlatform(page(['DS']), '3DS')).toBe(false)
  })

  it('rejects pages with no platform data and an unknown label', () => {
    expect(pageListsPlatform(page(undefined), '3DS')).toBe(false)
    expect(pageListsPlatform(page(['3DS']), undefined)).toBe(false)
    expect(pageListsPlatform('<html></html>', '3DS')).toBe(false)
  })
})
