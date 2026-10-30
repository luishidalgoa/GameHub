import { describe, it, expect, vi, afterEach } from 'vitest'

import { getRawgProvider, RawgAuthError } from '@/lib/metadata/rawg'

afterEach(() => { vi.unstubAllGlobals() })

describe('clave de RAWG rechazada', () => {
  it('la búsqueda lanza RawgAuthError con un 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    await expect(getRawgProvider('bad-key')!.search('Halo', 'switch')).rejects.toBeInstanceOf(RawgAuthError)
  })

  it('un 401 con el límite mensual es cuota agotada, no clave rechazada', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error": "The monthly API limit reached"}', { status: 401 })))
    const err = await getRawgProvider('k')!.search('Halo', 'switch').catch(e => e)
    expect(err).toBeInstanceOf(RawgAuthError)
    expect(err.quota).toBe(true)
  })

  it('un 401 sin hablar de límite es clave rechazada', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"detail": "Invalid key"}', { status: 401 })))
    const err = await getRawgProvider('k')!.search('Halo', 'switch').catch(e => e)
    expect(err.quota).toBe(false)
  })

  it('el detalle lanza RawgAuthError con un 403', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })))
    await expect(getRawgProvider('bad-key')!.fetchById(3328)).rejects.toBeInstanceOf(RawgAuthError)
  })

  it('la popularidad lanza RawgAuthError con un 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    await expect(getRawgProvider('bad-key')!.fetchPopularity(3328)).rejects.toBeInstanceOf(RawgAuthError)
  })

  it('un 500 sigue siendo una caída, no una clave rechazada', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
    const err = await getRawgProvider('k')!.search('Halo', 'switch').catch(e => e)
    expect(err).not.toBeInstanceOf(RawgAuthError)
    expect(err.message).toBe('RAWG search failed: 500')
  })
})
