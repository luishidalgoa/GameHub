'use client'

import { useState } from 'react'
import Image from 'next/image'
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
              className="group relative block aspect-video w-full overflow-hidden rounded-xl bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Image
                src={src}
                alt={`Screenshot ${i + 1}`}
                fill
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                className="object-cover transition-[filter] duration-150 group-hover:brightness-110"
                unoptimized
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
