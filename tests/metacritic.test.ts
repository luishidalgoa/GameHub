import { describe, expect, it } from 'vitest'
import { pageIsSameGame } from '@/lib/metadata/metacritic'

const page = (ogTitle: string) =>
  `<html><head><meta property="og:title" content="${ogTitle}"></head><body></body></html>`

describe('pageIsSameGame (#115)', () => {
  it('acepta la pagina del mismo juego', () => {
    expect(pageIsSameGame(page('Super Mario 64 - Metacritic'), 'Super Mario 64')).toBe(true)
  })

  it('rechaza otro juego de la misma serie', () => {
    expect(pageIsSameGame(page('Super Mario Sunshine - Metacritic'), 'Super Mario 64')).toBe(false)
  })

  it('acepta el mismo juego con las palabras en otro orden (007: Blood Stone / Blood Stone: 007)', () => {
    expect(pageIsSameGame(page('Blood Stone: 007 Reviews - Metacritic'), '007: Blood Stone')).toBe(true)
  })

  it('rechaza una pagina sin titulo', () => {
    expect(pageIsSameGame('<html></html>', 'Super Mario 64')).toBe(false)
  })
})
