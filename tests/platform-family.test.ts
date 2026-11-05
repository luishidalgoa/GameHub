import { describe, it, expect } from 'vitest'
import { collapseFamilies, familyOf, menuEntries, parsePlatformFamilies, type PlatformFamily } from '@/lib/platform-family'
import type { Platform } from '@/types/platform'

const gameBoy: PlatformFamily = {
  slug: 'game-boy',
  name: 'Game Boy',
  members: [{ slug: 'gb', label: 'GB' }, { slug: 'gbc', label: 'GBC' }, { slug: 'gba', label: 'GBA' }],
}

const p = (slug: string, name: string, games: number, sortOrder: number): Platform => ({
  id: sortOrder, slug, name, scanPath: '', extensions: '', iconPath: null, scanMode: 'flat',
  sortOrder, enabled: true, thumbnailWidth: 200, thumbnailHeight: 300,
  _count: { games }, createdAt: new Date(0), updatedAt: new Date(0),
})

describe('parsePlatformFamilies', () => {
  it('lee familias válidas y descarta las que no encajan', () => {
    const raw = JSON.stringify([gameBoy, { slug: 'Mal Slug', name: 'x', members: [] }, 'nada'])
    expect(parsePlatformFamilies(raw)).toEqual([gameBoy])
  })

  it('sin dato o con JSON roto no hay familias', () => {
    expect(parsePlatformFamilies(null)).toEqual([])
    expect(parsePlatformFamilies('{no')).toEqual([])
  })
})

describe('familyOf', () => {
  it('reconoce las consolas de una familia y ninguna otra', () => {
    expect(familyOf([gameBoy], 'gba')?.slug).toBe('game-boy')
    expect(familyOf([gameBoy], 'psp')).toBeUndefined()
    expect(familyOf([], 'gba')).toBeUndefined()
  })
})

describe('menuEntries', () => {
  it('muestra la familia una sola vez, en el sitio de su primera consola, con la suma de juegos', () => {
    const platforms = [
      p('switch', 'Switch', 10, 1),
      p('gb', 'Game Boy', 5, 2),
      p('gbc', 'Game Boy Color', 7, 3),
      p('gba', 'Game Boy Advance', 11, 4),
      p('psp', 'PSP', 3, 5),
    ]
    const menu = menuEntries(platforms, [gameBoy])
    expect(menu.map(e => e.key)).toEqual(['switch', 'game-boy', 'psp'])
    expect(menu[1]).toMatchObject({ href: '/platform/game-boy', name: 'Game Boy', badge: 23, iconSlug: 'gb' })
  })

  it('sin familias cada plataforma va sola', () => {
    const menu = menuEntries([p('psp', 'PSP', 3, 1)], [])
    expect(menu).toEqual([{ key: 'psp', href: '/platform/psp', name: 'PSP', iconSlug: 'psp', iconPath: null, badge: 3 }])
  })

  it('una familia cuyas consolas están todas desactivadas no aparece', () => {
    expect(menuEntries([p('psp', 'PSP', 3, 1)], [gameBoy]).map(e => e.key)).toEqual(['psp'])
  })
})

describe('collapseFamilies', () => {
  it('suma las consolas de la familia en una sola tarjeta de la portada', () => {
    const rows = [
      { slug: 'gb', name: 'Game Boy', games: 1 },
      { slug: 'gbc', name: 'Game Boy Color', games: 2 },
      { slug: 'gba', name: 'Game Boy Advance', games: 4 },
      { slug: 'psp', name: 'PSP', games: 8 },
    ]
    expect(collapseFamilies(rows, [gameBoy])).toEqual([
      { slug: 'game-boy', name: 'Game Boy', games: 7, members: ['gb', 'gbc', 'gba'] },
      { slug: 'psp', name: 'PSP', games: 8, members: ['psp'] },
    ])
  })
})
