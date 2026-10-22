'use client'

import { Children, useRef, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Reveal } from './Reveal'

/**
 * A horizontal row of wide tiles with a heading, scroll arrows on desktop and,
 * when `href` is given, a last tile that opens the whole collection. The caller
 * passes the tiles as children.
 */
export function WideRail({ kicker, title, href, moreLabel, moreHint, portrait = false, children }: {
  kicker?: string
  /** Omit for a rail that sits under its own heading. */
  title?: string
  /** Where "show all" goes; omit for a rail with no collection page. */
  href?: string
  moreLabel?: string
  moreHint?: string
  /** Tall 3:4 tiles (publishers) instead of 16:9 ones. */
  portrait?: boolean
  children: React.ReactNode
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState({ start: true, end: false })

  const measure = useCallback(() => {
    const el = scroller.current
    if (!el) return
    setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 })
  }, [])

  useEffect(() => {
    measure()
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

  const page = (dir: 1 | -1) => {
    const el = scroller.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' })
  }

  const itemWidth = portrait
    ? 'w-[168px] shrink-0 snap-start sm:w-[196px] xl:w-[216px]'
    : 'w-[min(78vw,400px)] shrink-0 snap-start sm:w-[360px] xl:w-[400px]'
  return (
    <Reveal as="section" className="group/rail">
      <div className="mb-4 flex items-end justify-between gap-4 px-4 sm:px-6">
        <div>
          {kicker && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] art-kicker">{kicker}</p>}
          {title && <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>}
        </div>
        <div className="flex items-center gap-2">
          {href && (
            <Link href={href} className="mr-2 text-sm text-white/60 transition-colors hover:text-white">{moreLabel} →</Link>
          )}
          <div className="hidden gap-1.5 sm:flex">
            {([-1, 1] as const).map(dir => (
              <button key={dir} type="button" onClick={() => page(dir)}
                      disabled={dir === -1 ? edge.start : edge.end}
                      aria-label={dir === -1 ? '←' : '→'}
                      className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-white/80 transition hover:border-white/40 hover:bg-white/10 disabled:opacity-25">
                {dir === -1 ? '←' : '→'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div ref={scroller} onScroll={measure}
           className="scrollbar-none flex snap-x snap-proximity gap-4 overflow-x-auto scroll-px-4 px-4 pb-6 pt-1 sm:scroll-px-6 sm:px-6"
           style={{ maskImage: 'linear-gradient(to right, transparent 0, black 24px, black calc(100% - 56px), transparent 100%)' }}>
        {Children.toArray(children).map((c, i) => (
          <div key={i} className={itemWidth}>{c}</div>
        ))}
        {href && (
          <div className={itemWidth}>
            <Link href={href}
                  className={`group relative flex ${portrait ? 'aspect-[3/4]' : 'aspect-video'} flex-col justify-between overflow-hidden rounded-xl border border-white/12 p-5 transition-colors hover:border-white/35`}
                  style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--art-a) 30%, transparent), color-mix(in srgb, var(--art-b) 22%, transparent))' }}>
              <span className="text-sm text-white/60">{moreHint}</span>
              <span className="flex items-end justify-between">
                <span className="text-3xl font-semibold leading-none tracking-tight">{moreLabel}</span>
                <span className="grid h-12 w-12 place-items-center rounded-full border border-white/30 text-xl transition-transform duration-500 group-hover:translate-x-1.5 group-hover:bg-white group-hover:text-black">→</span>
              </span>
            </Link>
          </div>
        )}
      </div>
    </Reveal>
  )
}
