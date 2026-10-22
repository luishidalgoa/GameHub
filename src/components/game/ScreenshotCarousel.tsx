'use client'

import { useState } from 'react'
import { ScreenshotLightbox } from './ScreenshotLightbox'

interface Props {
  screenshots: string[]
}

export function ScreenshotCarousel({ screenshots }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

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

      {lightboxIndex !== null && (
        <ScreenshotLightbox
          screenshots={screenshots}
          index={lightboxIndex}
          onChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  )
}
