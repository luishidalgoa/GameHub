import { describe, it, expect, afterEach, vi } from 'vitest'
import { searchImages, ImageSearchError } from '@/lib/image-search'

afterEach(() => { vi.unstubAllGlobals(); delete process.env.BRAVE_SEARCH_API_KEY })

describe('searchImages', () => {
  it('asks for a key first', async () => {
    await expect(searchImages('crash bandicoot')).rejects.toMatchObject({ code: 'no-key' })
  })

  it('keeps the full picture and the thumbnail, and skips results without either', async () => {
    process.env.BRAVE_SEARCH_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ results: [
      { title: 'Crash', source: 'example.com', thumbnail: { src: 'https://t/1.jpg' }, properties: { url: 'https://i/1.png' } },
      { title: 'sin miniatura', properties: { url: 'https://i/2.png' } },
      { title: 'sin imagen completa', thumbnail: { src: 'https://t/3.jpg' } },
    ] }), { status: 200 })))
    const hits = await searchImages('crash')
    expect(hits).toEqual([{ thumb: 'https://t/1.jpg', full: 'https://i/1.png', title: 'Crash', source: 'example.com' }])
  })

  it('reports a failed request as an http error', async () => {
    process.env.BRAVE_SEARCH_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })))
    await expect(searchImages('crash')).rejects.toBeInstanceOf(ImageSearchError)
  })
})
