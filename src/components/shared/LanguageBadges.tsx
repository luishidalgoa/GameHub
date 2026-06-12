import { cn } from '@/lib/utils'
import { languagesFromCsv } from '@/lib/rom-tags'

/** Render a game's languages (CSV of ISO codes) as small uppercase chips. */
export function LanguageBadges({
  languages,
  className,
}: {
  languages: string | null | undefined
  className?: string
}) {
  const langs = languagesFromCsv(languages)
  if (langs.length === 0) return null
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {langs.map((l) => (
        <span
          key={l}
          className="text-[10px] leading-none px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border uppercase tracking-wide"
        >
          {l}
        </span>
      ))}
    </span>
  )
}
