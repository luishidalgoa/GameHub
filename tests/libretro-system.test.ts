import { describe, it, expect } from 'vitest'
import { libretroSystemFor, libretroSupports, libretroSystemsFor, rankBoxarts } from '@/lib/metadata/libretro'

describe('libretroSystemFor', () => {
  it('elige la consola de Game Boy por la extensión del ROM local', () => {
    expect(libretroSystemFor('game-boy', { filePath: '/mnt/Gamehub/GBC/Games/Zelda (USA).gbc' })).toBe('gbc')
    expect(libretroSystemFor('game-boy', { filePath: '/mnt/Gamehub/GBA/Games/Eggo Mania.gba' })).toBe('gba')
    expect(libretroSystemFor('game-boy', { filePath: '/mnt/Gamehub/GB/Games/Tetris.gb' })).toBe('gb')
  })

  it('elige la consola de Game Boy por la identidad del torrent', () => {
    expect(libretroSystemFor('game-boy', { externalKey: 'torrent:minerva-gbc:key:gbc:007 the world is not enough' })).toBe('gbc')
    expect(libretroSystemFor('game-boy', { externalKey: 'torrent:minerva-gb:key:gb:10 pin bowling' })).toBe('gb')
  })

  it('cae en la fuente del torrent cuando la identidad no lleva consola (GBA heredado)', () => {
    expect(libretroSystemFor('game-boy', { externalKey: 'torrent:minerva-gba:key:007 nightfire' })).toBe('gba')
  })

  it('no adivina cuando no hay ninguna pista de consola', () => {
    expect(libretroSystemFor('game-boy', { externalKey: 'torrent:otra-fuente:key:x' })).toBeNull()
    expect(libretroSystemFor('game-boy', {})).toBeNull()
  })

  it('las demás plataformas usan su propio slug', () => {
    expect(libretroSystemFor('mega-drive', {})).toBe('mega-drive')
    expect(libretroSystemFor('ps2', { filePath: '/x/y.iso' })).toBe('ps2')
  })
})

describe('soporte por plataforma', () => {
  it('Game Boy es soportado y se reparte en gb, gbc y gba', () => {
    expect(libretroSupports('game-boy')).toBe(true)
    expect(libretroSystemsFor('game-boy')).toEqual(['gb', 'gbc', 'gba'])
  })

  it('Sega y Xbox ya tienen sistema de miniaturas', () => {
    for (const slug of ['mega-drive', 'master-system', 'game-gear', 'sega-cd', 'sega-32x', 'saturn', 'dreamcast', 'xbox', 'xbox-360']) {
      expect(libretroSupports(slug)).toBe(true)
    }
  })

  it('Switch sigue sin sistema', () => {
    expect(libretroSupports('switch')).toBe(false)
  })
})

describe('rankBoxarts con un título de torrent', () => {
  it('encuentra la caja aunque la consulta sea solo el título', () => {
    const names = ['Pokemon - Yellow Version (USA, Europe)', 'Tetris (World)']
    expect(rankBoxarts('Pokemon Yellow', names)[0]?.name).toBe('Pokemon - Yellow Version (USA, Europe)')
  })
})
