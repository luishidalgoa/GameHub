'use client'

import { useState } from 'react'
import Image from 'next/image'
import { WideRail } from '@/components/home/WideRail'
import { ScreenshotLightbox } from './ScreenshotLightbox'

/** How many screenshots are shown large before the rest move into the carousel. */
const LEAD = 4

/**
 * The first screenshots in a row at full size; the rest in the same carousel
 * the home page uses. Any screenshot opens in the lightbox.
 */
export function ScreenshotGallery({ screenshots }: { screenshots: string[] }) {
  const [open, setOpen] = useState<number | null>(null)
  const lead = screenshots.slice(0, LEAD)
  const rest = screenshots.slice(LEAD)

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {lead.map((src, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setOpen(i)}
            className="group relative aspect-video overflow-hidden rounded-xl bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Image
              src={src}
              alt={`Screenshot ${i + 1}`}
              fill
              sizes="(min-width: 1024px) 25vw, 50vw"
              className="object-cover transition-[filter] duration-150 group-hover:brightness-110"
              unoptimized
            />
          </button>
        ))}
      </div>

      {rest.length > 0 && (
        <div className="-mx-4 sm:-mx-6">
          <WideRail moreLabel="">
            {rest.map((src, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setOpen(LEAD + i)}
                className="group relative block aspect-video w-full overflow-hidden rounded-xl bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Image
                  src={src}
                  alt={`Screenshot ${LEAD + i + 1}`}
                  fill
                  sizes="400px"
                  className="object-cover transition-[filter] duration-150 group-hover:brightness-110"
                  unoptimized
                />
              </button>
            ))}
          </WideRail>
        </div>
      )}

      {open !== null && (
        <ScreenshotLightbox
          screenshots={screenshots}
          index={open}
          onChange={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  )
}
