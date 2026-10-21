import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseLaunchBoxImages, parseNuxtImages } from '@/lib/metadata/launchbox'

// Ficha real de LaunchBox (Doom II, GBA) guardada como fixture. La pagina muestra
// miniaturas de 400 px; el estado de Nuxt nombra los originales.
const html = fs.readFileSync(path.resolve('tests/fixtures/launchbox-doom2.html'), 'utf8')

describe('imagenes de LaunchBox en su tamano original', () => {
  const images = parseNuxtImages(html)
  const byType = (t: string) => images.filter(i => i.type === t)

  it('lee todas las imagenes del estado de la pagina', () => {
    expect(images.length).toBeGreaterThanOrEqual(12)
  })

  it('el fanart de fondo es de 1920x1080, no la miniatura de 400x225', () => {
    const fanart = byType('Fanart - Background')[0]
    expect(fanart).toBeDefined()
    expect(fanart.width).toBe(1920)
    expect(fanart.height).toBe(1080)
    expect(fanart.thumbUrl).toBeDefined()
    expect(fanart.url).not.toBe(fanart.thumbUrl)
  })

  it('la caja frontal declara 800 px de ancho y el banner 760x140', () => {
    expect(byType('Box - Front')[0].width).toBe(800)
    expect(byType('Banner')[0]).toMatchObject({ width: 760, height: 140 })
  })

  it('parseLaunchBoxImages devuelve los originales, no las miniaturas', () => {
    const all = parseLaunchBoxImages(html)
    expect(all.find(i => i.type === 'Fanart - Background')?.width).toBe(1920)
  })

  it('sin estado de Nuxt, cae a las miniaturas del <img>', () => {
    const stripped = html.replace(/<script type="application\/json" data-nuxt-data[\s\S]*?<\/script>/, '')
    const all = parseLaunchBoxImages(stripped)
    expect(all.length).toBeGreaterThan(5)
    expect(all.every(i => i.width === undefined)).toBe(true)
  })
})
