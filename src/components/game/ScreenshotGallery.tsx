'use client'

import { useState } from 'react'
import { WideRail } from '@/components/home/WideRail'
import { ScreenshotLightbox } from './ScreenshotLightbox'

/** Four screenshots fit in view at a time on desktop; the arrows move through the rest. */
const PER_VIEW = 'w-[calc((100%-1rem)/2)] shrink-0 snap-start sm:w-[calc((100%-2rem)/3)] lg:w-[calc((100%-3rem)/4)]'

/**
 * Every screenshot in the carousel the home page uses: arrows move it, and any
 * screenshot opens in the lightbox.
 */
export function ScreenshotGallery({ screenshots }: { screenshots: string[] }) {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <>
      <div className="-mx-4 sm:-mx-6">
        <WideRail moreLabel="" itemClassName={PER_VIEW}>
          {screenshots.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setOpen(i)}
              className="group relative block w-full overflow-hidden rounded-xl bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {/* The card takes the picture's own proportions: nothing is cropped. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`Screenshot ${i + 1}`}
                loading="lazy"
                decoding="async"
                className="block h-auto w-full transition-[filter] duration-150 group-hover:brightness-110"
              />
            </button>
          ))}
        </WideRail>
      </div>

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
