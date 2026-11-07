import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  nintendoConsoleOf,
  parseSolrHits,
  parseGallery,
  parseOverview,
  matchExact,
  storeKey,
  nintendoMetadata,
  fetchNintendoPage,
  type NintendoHit,
} from '@/lib/metadata/nintendo'

const solr = JSON.parse(fs.readFileSync(path.resolve('tests/fixtures/nintendo-solr-3minutes.json'), 'utf8'))
const page = fs.readFileSync(path.resolve('tests/fixtures/nintendo-page-3minutes.html'), 'utf8')

describe('nintendoConsoleOf', () => {
  it('mapea los slugs de Switch y deja fuera el resto', () => {
    expect(nintendoConsoleOf('switch')).toBe('switch')
    expect(nintendoConsoleOf('switch-2')).toBe('switch-2')
    expect(nintendoConsoleOf('ps4')).toBeNull()
  })
})

describe('parseSolrHits', () => {
  const hits = parseSolrHits(solr, 'switch')

  it('lee la ficha de 3 Minutes to Midnight', () => {
    expect(hits).toHaveLength(1)
    const hit = hits[0]
    expect(hit.id).toBe(2645618)
    expect(hit.title).toBe('3 Minutes to Midnight®')
    expect(hit.url).toMatch(/^https:\/\/www\.nintendo\.com\/es-es\//)
    expect(hit.console).toBe('switch')
    expect(hit.releaseYear).toBe(2024)
    expect(hit.releaseDate).toBe('26-09-2024')
    expect(hit.publisher).toBe('SCARECROW STUDIO')
    expect(hit.genres).toEqual(['Aventura', 'Puzle'])
    expect(hit.ageRating).toBe('PEGI 12')
    expect(hit.languages.length).toBeGreaterThan(0)
    expect(hit.languages).toContain('spanish')
    expect(hit.images.square).toMatch(/^https:\/\//)
    expect(hit.images.banner).toMatch(/^https:\/\//)
  })

  it('omite campos que no vienen (developer, packshot)', () => {
    expect(hits[0].developer).toBeUndefined()
    expect(hits[0].images.packshot).toBeUndefined()
  })

  it('ignora documentos que no son GAME', () => {
    const json = { response: { docs: [{ ...solr.response.docs[0], type: 'DLC' }] } }
    expect(parseSolrHits(json, 'switch')).toEqual([])
  })

  it('tolera respuestas vacías o malformadas', () => {
    expect(parseSolrHits({ response: { docs: [] } }, 'switch')).toEqual([])
    expect(parseSolrHits(null, 'switch')).toEqual([])
    expect(parseSolrHits({ response: {} }, 'switch')).toEqual([])
  })
})

describe('parseGallery', () => {
  const gallery = parseGallery(page)

  it('saca las 6 imágenes de tamaño completo, únicas y en orden', () => {
    expect(gallery).toHaveLength(6)
    expect(new Set(gallery).size).toBe(6)
    for (const url of gallery) {
      expect(url).toMatch(/^https:\/\/www\.nintendo\.com\//)
      expect(url).toMatch(/\.jpg$/)
      expect(url).not.toContain('_TM_')
    }
    expect(gallery[0]).toMatch(/NSwitchDS_2MinutesToMidnight_01\.jpg$/)
  })

  it('devuelve vacío sin galería', () => {
    expect(parseGallery('<html></html>')).toEqual([])
  })
})

describe('parseOverview', () => {
  const text = parseOverview(page)

  it('devuelve la descripción en español sin etiquetas ni entidades', () => {
    expect(text).toBeDefined()
    expect(text).toContain('Resulta que')
    expect(text).toContain('¿Dónde están?')
    expect(text).not.toMatch(/<|>|&[a-z]+;/)
  })

  it('no mete las advertencias legales de la misma sección', () => {
    expect(text).not.toContain('Información esencial')
    expect(text).not.toContain('medidas de protección técnica')
  })

  it('devuelve undefined si no hay sección overview', () => {
    expect(parseOverview('<html></html>')).toBeUndefined()
  })
})

describe('matchExact and storeKey', () => {
  it('storeKey ignora mayúsculas, acentos, ® y signos', () => {
    expect(storeKey('3 Minutes to Midnight®')).toBe(storeKey('3 minutes to midnight'))
    expect(storeKey('3 Minutes to Midnight®')).toBe('3minutestomidnight')
    expect(storeKey('Pokémon Scarlet')).toBe('pokemonscarlet')
  })

  const solrHits = parseSolrHits(solr, 'switch')

  it('encuentra la coincidencia exacta por clave normalizada', () => {
    expect(matchExact(solrHits, '3 minutes to midnight')?.id).toBe(2645618)
  })

  it('no hace coincidencias aproximadas', () => {
    expect(matchExact(solrHits, '3 Minutes')).toBeNull()
    expect(matchExact(solrHits, '3 Minutes to Midnight 2')).toBeNull()
  })

  it('solo considera juegos GAME: un DLC con el mismo título no cuenta', () => {
    const dlc = { response: { docs: [{ ...solr.response.docs[0], type: 'DLC' }] } }
    expect(matchExact(parseSolrHits(dlc, 'switch'), '3 Minutes to Midnight')).toBeNull()
  })
})

describe('nintendoMetadata', () => {
  const [hit] = parseSolrHits(solr, 'switch')
  const gallery = parseGallery(page)

  it('da la forma de MetadataResult con la portada cuadrada', () => {
    const meta = nintendoMetadata(hit, gallery, 'Descripción')
    expect(meta.source).toBe('nintendo')
    expect(meta.id).toBe(2645618)
    expect(meta.title).toBe('3 Minutes to Midnight®')
    expect(meta.coverUrl).toBe(hit.images.square)
    expect(meta.screenshots).toHaveLength(gallery.length)
    expect(meta.genre).toBe('Aventura, Puzle')
    expect(meta.publisher).toBe('SCARECROW STUDIO')
    expect(meta.releaseYear).toBe(2024)
    expect(meta.description).toBe('Descripción')
    expect(meta.platformSlugs).toEqual(['switch'])
  })

  it('sin galería ni descripción deja screenshots vacío y omite description', () => {
    const meta = nintendoMetadata(hit)
    expect(meta.screenshots).toEqual([])
    expect(meta).not.toHaveProperty('description')
  })

  it('cae al packshot si no hay cuadrado, y omite developer si no existe', () => {
    const bare: NintendoHit = { ...hit, developer: undefined, images: { packshot: 'https://www.nintendo.com/p.png' } }
    const meta = nintendoMetadata(bare)
    expect(meta.coverUrl).toBe('https://www.nintendo.com/p.png')
    expect(meta).not.toHaveProperty('developer')
  })
})

describe('fetchNintendoPage', () => {
  it('no sale de nintendo.com y devuelve vacío sin hacer red', async () => {
    await expect(fetchNintendoPage('https://example.com/juego.html')).resolves.toEqual({ gallery: [], description: undefined })
  })
})
