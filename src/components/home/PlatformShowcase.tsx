'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { consoleModelFor, withOrientation } from '@/lib/consoles'
import type { OrientationMap } from '@/lib/console-orientation'
import { ConsoleViewer } from './ConsoleViewer'
import { Reveal } from './Reveal'

/**
 * The platforms as columns, each with its console floating above the name. No
 * cards: the models stand on the page itself, lit by the current theme color.
 * A platform without a model shows its name alone.
 */
export function PlatformShowcase({ platforms, orientations, kicker, title }: {
  platforms: { slug: string; name: string; games: number }[]
  orientations: OrientationMap
  kicker: string
  title: string
}) {
  const t = useTranslations('Home')
  const shown = platforms.filter(p => p.games > 0)
  if (shown.length === 0) return null
  return (
    <Reveal as="section">
      <div className="mb-2 px-4 sm:px-6">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] art-kicker">{kicker}</p>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      </div>
      <div className="flex flex-wrap justify-center gap-y-2 px-4 sm:px-6">
        {shown.map((p, i) => {
          const base = consoleModelFor(p.slug)
          const model = base && withOrientation(base, orientations)
          return (
            <Reveal key={p.slug} index={i % 5} className="w-1/2 sm:w-1/3 lg:w-1/4 xl:w-1/5">
              <Link href={`/platform/${p.slug}`} className="group relative block rounded-2xl pb-5 pt-2 outline-none focus-visible:ring-2 focus-visible:ring-white/70">
                <div className="relative mx-auto aspect-square w-full max-w-[260px]">
                  <div className="absolute inset-[18%] rounded-full opacity-0 blur-2xl transition-opacity duration-700 group-hover:opacity-70"
                       style={{ background: 'radial-gradient(circle, var(--art-a), transparent 70%)' }} />
                  {model && <ConsoleViewer model={model} className="absolute inset-0" />}
                </div>
                <div className="px-2 text-center">
                  <p className="text-lg font-semibold tracking-tight transition-transform duration-500 group-hover:-translate-y-0.5">{p.name}</p>
                  <p className="mt-0.5 text-sm text-white/50">{t('platformGames', { count: p.games })}</p>
                </div>
              </Link>
            </Reveal>
          )
        })}
      </div>
    </Reveal>
  )
}
