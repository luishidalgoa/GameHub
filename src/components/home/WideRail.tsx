'use client'

import { Children, useRef, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Reveal } from './Reveal'

/**
 * A horizontal row of wide tiles with a heading, scroll arrows on desktop and,
 * when `href` or `onMore` is given, a last tile that opens the whole collection.
 * `onNearEnd` fires when the scroll gets within one page of the end, so the
 * caller can render the next tiles only when the reader gets to them.
 */
export function WideRail({ kicker, title, href, onMore, onNearEnd, moreLabel, moreHint, moreVariant = 'wide', portrait = false, itemClassName, children }: {
  kicker?: string
  /** Omit for a rail that sits under its own heading. */
  title?: string
  /** Where "show all" goes; omit for a rail with no collection page. */
  href?: string
  /** "Show all" as an action when there is no page to go to. */
  onMore?: () => void
  onNearEnd?: () => void
  moreLabel?: string
  moreHint?: string
  /** 'square' matches the tiles of a row of consoles; 'wide' the rest. */
  moreVariant?: 'wide' | 'square'
  /** Tall 3:4 tiles (publishers) instead of 16:9 ones. */
  portrait?: boolean
  /** Replaces the default tile width, e.g. to show four tiles at a time. */
  itemClassName?: string
  children: React.ReactNode
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState({ start: true, end: false })

  const measure = useCallback(() => {
    const el = scroller.current
    if (!el) return
    setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 })
    if (onNearEnd && el.scrollLeft + 2 * el.clientWidth >= el.scrollWidth) onNearEnd()
  }, [onNearEnd])

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

  const itemWidth = itemClassName ?? (portrait
    ? 'w-[168px] shrink-0 snap-start sm:w-[196px] xl:w-[216px]'
    : 'w-[min(78vw,400px)] shrink-0 snap-start sm:w-[360px] xl:w-[400px]')
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
                      className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-white/80 transition hover:border-white/40 hover:bg-white/10 disabled:opacity-30">
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
        {(href || onMore) && (
          <div className={itemWidth}>
            <MoreTile href={href} onMore={onMore} portrait={portrait} variant={moreVariant} moreLabel={moreLabel} moreHint={moreHint} />
          </div>
        )}
      </div>
    </Reveal>
  )
}

function MoreTile({ href, onMore, portrait, variant, moreLabel, moreHint }: {
  href?: string
  onMore?: () => void
  portrait: boolean
  variant: 'wide' | 'square'
  moreLabel?: string
  moreHint?: string
}) {
  const style = { background: 'linear-gradient(135deg, color-mix(in srgb, var(--art-a) 30%, transparent), color-mix(in srgb, var(--art-b) 22%, transparent))' }
  const arrow = 'grid place-items-center rounded-full border border-white/30 transition-transform duration-500 group-hover:translate-x-1 group-hover:bg-white group-hover:text-black'
  if (variant === 'square') {
    // Same box as a console tile: the square sits where the model sits, and the two invisible
    // lines stand where the name and the game count are, so the card is as tall as its neighbours.
    const frame = 'group relative block w-full rounded-2xl pb-5 pt-2 outline-none focus-visible:ring-2 focus-visible:ring-white/70'
    const card = 'mx-auto flex aspect-square w-full max-w-[220px] flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl border border-white/12 p-4 text-center transition-colors group-hover:border-white/35'
    const body = (
      <>
        <div className={card} style={style}>
          <span className={`${arrow} h-14 w-14 text-xl`}>→</span>
          <span className="text-base font-semibold tracking-tight">{moreLabel}</span>
        </div>
        <div className="invisible px-2 text-center" aria-hidden>
          <p className="text-lg font-semibold">&nbsp;</p>
          <p className="mt-0.5 text-sm">&nbsp;</p>
        </div>
      </>
    )
    return href
      ? <Link href={href} className={frame}>{body}</Link>
      : <button type="button" onClick={onMore} className={`${frame} text-left`}>{body}</button>
  }
  const className = `group relative flex ${portrait ? 'aspect-[3/4]' : 'aspect-video'} w-full flex-col justify-between overflow-hidden rounded-xl border border-white/12 p-5 text-left transition-colors hover:border-white/35`
  const body = (
    <>
      <span className="text-sm text-white/60">{moreHint}</span>
      <span className="flex items-end justify-between">
        <span className="text-3xl font-semibold leading-none tracking-tight">{moreLabel}</span>
        <span className={`${arrow} h-12 w-12 text-xl`}>→</span>
      </span>
    </>
  )
  return href
    ? <Link href={href} className={className} style={style}>{body}</Link>
    : <button type="button" onClick={onMore} className={className} style={style}>{body}</button>
}
