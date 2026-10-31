import Link from 'next/link'

/**
 * The platform filter of a game grid. `active` is the slug in use, empty for every platform.
 * Works in server and client components: each chip is a link, so the filter is part of the URL.
 */
export function PlatformChips({ platforms, active, hrefFor, allLabel }: {
  platforms: { slug: string; name: string }[]
  active: string
  hrefFor: (slug: string) => string
  allLabel: string
}) {
  if (platforms.length < 2) return null
  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs transition ${on
      ? 'border-white/40 bg-white/[0.16] text-white'
      : 'border-white/10 bg-white/[0.06] text-white/70 hover:text-white'}`
  return (
    <nav className="mb-8 flex flex-wrap gap-2">
      <Link href={hrefFor('')} className={chip(!active)}>{allLabel}</Link>
      {platforms.map(p => (
        <Link key={p.slug} href={hrefFor(p.slug)} className={chip(active === p.slug)}>{p.name}</Link>
      ))}
    </nav>
  )
}
