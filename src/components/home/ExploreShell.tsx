import { getTranslations } from 'next-intl/server'
import { HomeStage } from './HomeStage'
import { BackLink } from '@/components/shared/BackLink'

/** The frame of a "show all" page: the same stage as the home, a heading, and the content. */
export async function ExploreShell({ kicker, title, children }: {
  kicker: string
  title: string
  children: React.ReactNode
}) {
  // The back link names the sidebar's entry for the home, so it reads as the menu does.
  const t = await getTranslations('Sidebar')
  return (
    <HomeStage>
      <div className="pb-16 pt-6">
        {/* Back goes to the page it was opened from; the home only when there is no history. */}
        <BackLink
          fallback="/"
          label={t('library')}
          className="inline-flex items-center gap-2 whitespace-nowrap text-sm text-white/55 transition hover:text-white"
        />
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.22em] art-kicker">{kicker}</p>
        <h1 className="mt-1 text-4xl font-black tracking-tight sm:text-5xl">{title}</h1>
        <div className="mt-8">{children}</div>
      </div>
    </HomeStage>
  )
}
