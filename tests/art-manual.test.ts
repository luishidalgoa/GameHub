import { describe, it, expect } from 'vitest'
import { fieldsFor, isInWindow, REMOVAL_WINDOW_MS } from '@/lib/art-manual'

describe('removing a manual image is undoable for a window', () => {
  it('the window is open right after removal and closed after it', () => {
    const removedAt = new Date('2026-10-22T12:00:00Z')
    expect(isInWindow(removedAt, removedAt.getTime() + 1000)).toBe(true)
    expect(isInWindow(removedAt, removedAt.getTime() + REMOVAL_WINDOW_MS)).toBe(false)
  })

  it('each kind fills the fields it shows: a fanart and a banner the backdrop, a logo the logo', () => {
    expect(fieldsFor('logo', 'k')).toEqual({ logoPath: 'k' })
    expect(fieldsFor('fanart', 'k')).toEqual({ tilePath: 'k', backdropPath: 'k', backdropKind: 'fanart' })
    expect(fieldsFor('banner', 'k')).toEqual({ backdropPath: 'k', backdropKind: 'banner', tilePath: 'k' })
  })
})
