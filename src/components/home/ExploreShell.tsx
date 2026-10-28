import { HomeStage } from './HomeStage'
import { BackLink } from '@/components/shared/BackLink'

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
        {/* Back goes to the page it was opened from; the home only when there is no history. */}
        <BackLink fallback="/" label={backLabel} className="text-sm text-white/55 transition hover:text-white" />
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.22em] art-kicker">{kicker}</p>
        <h1 className="mt-1 text-4xl font-black tracking-tight sm:text-5xl">{title}</h1>
        <div className="mt-8">{children}</div>
      </div>
    </HomeStage>
  )
}
