'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  screenshots: string[]
}

export function ScreenshotCarousel({ screenshots }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const close  = useCallback(() => setLightboxIndex(null), [])
  const prev   = useCallback(() => setLightboxIndex((i) => (i !== null ? (i - 1 + screenshots.length) % screenshots.length : 0)), [screenshots.length])
  const next   = useCallback(() => setLightboxIndex((i) => (i !== null ? (i + 1) % screenshots.length : 0)), [screenshots.length])

  useEffect(() => {
    if (lightboxIndex === null) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     close()
      if (e.key === 'ArrowLeft')  prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightboxIndex, close, prev, next])

  if (screenshots.length === 0) return null

  return (
    <>
      {/* Strip */}
      <div
        className="flex gap-2 overflow-x-auto pb-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {screenshots.map((src, i) => (
          <button
            key={i}
            onClick={() => setLightboxIndex(i)}
            className="shrink-0 rounded-lg overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-ring group"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`Screenshot ${i + 1}`}
              className="h-24 w-auto object-cover rounded-lg group-hover:brightness-110 transition-[filter] duration-150"
            />
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={close}
        >
          {/* Image — stop propagation so clicking the image doesn't close */}
          <div
            className="relative max-w-5xl w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={screenshots[lightboxIndex]}
              alt={`Screenshot ${lightboxIndex + 1}`}
              className="w-full rounded-xl shadow-2xl object-contain max-h-[80vh]"
            />

            {/* Counter */}
            <span className="absolute top-3 left-3 text-xs text-white/60 bg-black/50 rounded-full px-2.5 py-1 tabular-nums">
              {lightboxIndex + 1} / {screenshots.length}
            </span>

            {/* Close */}
            <button
              onClick={close}
              className="absolute top-3 right-3 p-1.5 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/80 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Prev / Next */}
          {screenshots.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); prev() }}
                className="absolute left-4 p-2 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/80 transition-colors"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); next() }}
                className="absolute right-4 p-2 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-black/80 transition-colors"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}
        </div>
      )}
    </>
  )
}
