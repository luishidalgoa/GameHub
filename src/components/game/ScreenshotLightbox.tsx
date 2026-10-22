'use client'

import { useEffect } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

/** Full-screen viewer for a list of screenshots. Esc closes, the arrow keys move. */
export function ScreenshotLightbox({
  screenshots,
  index,
  onChange,
  onClose,
}: {
  screenshots: string[]
  index: number
  onChange: (index: number) => void
  onClose: () => void
}) {
  const prev = () => onChange((index - 1 + screenshots.length) % screenshots.length)
  const next = () => onChange((index + 1) % screenshots.length)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     onClose()
      if (e.key === 'ArrowLeft')  onChange((index - 1 + screenshots.length) % screenshots.length)
      if (e.key === 'ArrowRight') onChange((index + 1) % screenshots.length)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [index, screenshots.length, onChange, onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Image — stop propagation so clicking the image doesn't close */}
      <div
        className="relative max-w-5xl w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={screenshots[index]}
          alt={`Screenshot ${index + 1}`}
          className="w-full rounded-xl shadow-2xl object-contain max-h-[80vh]"
        />

        {/* Counter */}
        <span className="absolute top-3 left-3 text-xs text-white/60 bg-black/50 rounded-full px-2.5 py-1 tabular-nums">
          {index + 1} / {screenshots.length}
        </span>

        {/* Close */}
        <button
          onClick={onClose}
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
  )
}
