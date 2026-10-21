'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { TileGame } from '@/lib/home-data'
import { consoleModelFor, withOrientation } from '@/lib/consoles'
import type { OrientationMap } from '@/lib/console-orientation'
import { ConsoleViewer } from './ConsoleViewer'
import { useStage } from './HomeStage'
import { SurpriseButton } from './SurpriseButton'

const SLIDE_MS = 9000

/**
 * The first screen: one game at a time, large, with its console floating beside
 * the title. It rotates through the games it is given and retints the page after
 * each one. Hovering or focusing it holds the current slide.
 */
export function HeroStage({ games, orientations, labels }: {
  games: TileGame[]
  orientations: OrientationMap
  labels: { featured: string; view: string }
}) {
  const stage = useStage()
  const [index, setIndex] = useState(0)
  const [held, setHeld] = useState(false)
  const game = games[index] ?? games[0]

  useEffect(() => {
    if (game) stage.show({ palette: game.palette, backdrop: game.backdrop })
    return () => stage.show(null)
  }, [game, stage])

  useEffect(() => {
    if (held || games.length < 2) return
    const timer = setTimeout(() => setIndex(i => (i + 1) % games.length), SLIDE_MS)
    return () => clearTimeout(timer)
  }, [held, index, games.length])

  if (!game) return null
  const base = consoleModelFor(game.platformSlug)
  const model = base && withOrientation(base, orientations)
  const meta = [game.genre, game.year, game.publisher].filter(Boolean).join('  ·  ')

  return (
    <section
      className="relative -mx-4 -mt-4 min-h-[min(82vh,760px)] overflow-hidden sm:-mx-6 sm:-mt-6"
      onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)} onBlurCapture={() => setHeld(false)}
    >
      {/* Crisp art, fading out toward the text. Keyed so each slide cross-fades in. */}
      {game.image && (
        <div key={`art-${game.id}`} className="home-rise absolute inset-y-0 right-0 w-full md:w-[68%]"
             style={{ maskImage: 'linear-gradient(to left, black 25%, transparent 92%), linear-gradient(to top, transparent 0, black 28%)', maskComposite: 'intersect', WebkitMaskComposite: 'source-in' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={game.image} alt="" className="home-drift h-full w-full object-cover opacity-70" />
        </div>
      )}

      {model && (
        <div className="pointer-events-none absolute -right-4 top-1/2 hidden aspect-square w-[min(50vw,640px)] -translate-y-[54%] md:block">
          <div key={`console-${model.slug}`} className="home-rise relative h-full w-full">
            <div className="absolute inset-[12%] rounded-full opacity-60 blur-3xl"
                 style={{ background: 'radial-gradient(circle, var(--art-a), transparent 68%)' }} />
            <ConsoleViewer model={model} className="relative h-full w-full" />
          </div>
        </div>
      )}

      <div key={`copy-${game.id}`} className="relative z-10 flex min-h-[inherit] max-w-[640px] flex-col justify-center gap-5 px-4 pb-28 pt-16 sm:px-6 md:pb-24">
        <p className="home-rise flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.26em] text-white/75" style={{ '--i': 0 } as React.CSSProperties}>
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--art-a)] shadow-[0_0_14px_3px_var(--art-a)]" />
          {labels.featured} · {game.platformName}
        </p>

        {game.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={game.logo} alt={game.title} className="home-rise max-h-32 w-auto max-w-full self-start object-contain drop-shadow-[0_6px_28px_rgba(0,0,0,0.6)] sm:max-h-40"
               style={{ '--i': 1 } as React.CSSProperties} />
        ) : (
          <h1 className="home-rise text-balance text-5xl font-black leading-[0.95] tracking-tight drop-shadow-[0_6px_28px_rgba(0,0,0,0.55)] sm:text-6xl lg:text-7xl"
              style={{ '--i': 1 } as React.CSSProperties}>
            {game.title}
          </h1>
        )}
        {game.logo && <h1 className="sr-only">{game.title}</h1>}

        {meta && <p className="home-rise text-sm text-white/65" style={{ '--i': 2 } as React.CSSProperties}>{meta}</p>}
        {game.description && (
          <p className="home-rise line-clamp-3 max-w-prose text-[15px] leading-relaxed text-white/75" style={{ '--i': 3 } as React.CSSProperties}>
            {game.description}
          </p>
        )}

        <div className="home-rise mt-1 flex items-center gap-5" style={{ '--i': 4 } as React.CSSProperties}>
          <Link href={`/game/${game.id}`}
                className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition hover:scale-[1.03] hover:shadow-[0_0_34px_-4px_var(--art-a)]">
            {labels.view}
          </Link>
          <SurpriseButton variant="text" />
        </div>
      </div>

      {games.length > 1 && (
        <ol className="absolute inset-x-4 bottom-6 z-10 flex gap-3 sm:inset-x-6">
          {games.map((g, i) => (
            <li key={g.id} className="min-w-0 flex-1 max-w-[210px]">
              <button type="button" onClick={() => setIndex(i)} className="group block w-full text-left">
                <span className="relative block h-[3px] overflow-hidden rounded-full bg-white/20">
                  {i === index && !held && (
                    <span key={`p-${index}`} className="absolute inset-0 origin-left bg-white"
                          style={{ animation: `home-fill ${SLIDE_MS}ms linear forwards` }} />
                  )}
                  {i === index && held && <span className="absolute inset-0 bg-white" />}
                  {i < index && <span className="absolute inset-0 bg-white/60" />}
                </span>
                <span className={`mt-2 block truncate text-xs transition-colors ${i === index ? 'text-white' : 'text-white/45 group-hover:text-white/75'}`}>
                  {g.title}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
