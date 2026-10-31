'use client'

import { useRouter } from 'next/navigation'

/**
 * The platform filter of a game grid: one compact select. Choosing a platform moves the URL to
 * the grid's own address with `platform=<slug>`, so the filter is part of the link.
 */
export function PlatformSelect({ platforms, active, base, allLabel }: {
  platforms: { slug: string; name: string }[]
  active: string
  /** The grid's address and query, without the platform. */
  base: string
  allLabel: string
}) {
  const router = useRouter()
  if (platforms.length < 2) return null
  const go = (slug: string) => {
    if (!slug) return router.push(base)
    router.push(`${base}${base.includes('?') ? '&' : '?'}platform=${slug}`)
  }
  return (
    <select
      value={active}
      onChange={e => go(e.target.value)}
      className="mb-6 h-9 rounded-md border border-white/10 bg-white/[0.06] px-3 text-sm text-white/80 focus:border-white/30 focus:outline-none"
    >
      <option value="">{allLabel}</option>
      {platforms.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
    </select>
  )
}
