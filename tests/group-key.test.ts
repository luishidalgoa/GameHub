import { describe, expect, it } from 'vitest'
import { canonicalGroupKey } from '@/lib/group-key'
import { gameGroupKey } from '@/lib/rom-tags'

describe('clave de grupo (#77)', () => {
  it('un juego de Switch se agrupa por su Title ID, no por el nombre', () => {
    const key = canonicalGroupKey({
      folderName: 'Some Game',
      fileNames: ['Some Game [0100ABCDEF123000][v0].nsp'],
      switchMode: true,
    })
    expect(key.startsWith('tid:')).toBe(true)
  })

  it('fuera de Switch la clave sale del nombre normalizado', () => {
    expect(canonicalGroupKey({ fileNames: ['Zelda (USA).gba'], switchMode: false })).toBe('name:zelda')
  })

  it('la extension .fig de SNES no entra en la clave', () => {
    expect(gameGroupKey('Final Fight (1990) (ESP).fig')).toBe('name:finalfight')
  })

  it('el numero de version no cambia el juego', () => {
    expect(gameGroupKey('Grand Theft Auto Vice City v458752 (2002).nsz')).toBe('name:grandtheftautovicecity')
  })
})
