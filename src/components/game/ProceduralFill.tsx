'use client'

import { useEffect, useState } from 'react'
import { hexToRgb, type RGB } from '@/lib/palette-color'

/** The page's own base colour, the one the gradient fades into. */
const BASE: RGB = [10, 10, 12]
/** How much of the banner shows through its dark filter (bg-background/72). */
const BANNER_SHOW = 0.28

/** Average colour of the bottom rows of the banner art: where the banner ends. */
function sampleBottom(img: HTMLImageElement): RGB | null {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 32
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, 32, 32)
  const data = ctx.getImageData(0, 21, 32, 11).data
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++
  }
  return [r / n / 255, g / n / 255, b / n / 255]
}

/**
 * The page below the banner: a gradient that starts at the colour the banner
 * ends in (sampled from its art, or the game's palette) and fades to the page
 * colour, so the two read as one surface.
 */
export function ProceduralFill({ src, palette }: { src: string | null; palette: string[] }) {
  const [sampled, setSampled] = useState<RGB | null>(null)

  useEffect(() => {
    if (!src) return
    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const c = sampleBottom(img)
        if (!cancelled && c) setSampled(c)
      } catch { /* the art can't be read: keep the palette colour */ }
    }
    img.src = src
    return () => { cancelled = true }
  }, [src])

  const paletteColor = palette.map(hexToRgb).find((c): c is RGB => c !== null) ?? null
  const art = sampled ?? paletteColor
  // What the banner looks like at its bottom edge: a little of the art over the base.
  const top = art
    ? art.map((v, i) => Math.round((v * 255 * BANNER_SHOW) + BASE[i] * (1 - BANNER_SHOW)))
    : BASE
  const topHex = '#' + top.map(v => v.toString(16).padStart(2, '0')).join('')
  const baseHex = '#' + BASE.map(v => v.toString(16).padStart(2, '0')).join('')

  return (
    <div
      className="absolute inset-0"
      style={{ background: `linear-gradient(to bottom, ${topHex} 0%, ${baseHex} 100%)` }}
    />
  )
}
