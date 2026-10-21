import Link from 'next/link'
import { HomeStage } from './HomeStage'

/** The frame of a "show all" page: the same stage as the home, a heading, and the content. */
export function ExploreShell({ kicker, title, backLabel, children }: {
  kicker: string
  title: string
  backLabel: string
  children: React.ReactNode
}) {
  return (
    <HomeStage>
      <div className="pb-16 pt-6">
        <Link href="/" className="text-sm text-white/55 transition hover:text-white">← {backLabel}</Link>
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--art-a)]">{kicker}</p>
        <h1 className="mt-1 text-4xl font-black tracking-tight sm:text-5xl">{title}</h1>
        <div className="mt-8">{children}</div>
      </div>
    </HomeStage>
  )
}
