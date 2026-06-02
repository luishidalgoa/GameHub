'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ComponentProps, MouseEvent } from 'react'

type Props = ComponentProps<typeof Link> & {
  /** Optional shared-element name (e.g. `game-cover-123`). Applied to a child
   *  marked [data-vt-cover] ONLY for the clicked link during the transition, so
   *  the same game appearing in multiple strips never collides. */
  coverName?: string
}

/**
 * Drop-in replacement for next/link that wraps the client-side navigation in the
 * browser's View Transitions API (when supported) for a smooth cross-fade, plus
 * an optional shared-element morph of the cover. Degrades to a normal Link
 * otherwise (skipped for modified clicks, _blank targets, reduced-motion).
 */
export function ViewTransitionLink({ href, onClick, target, coverName, ...rest }: Props) {
  const router = useRouter()

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented) return

    const start = (document as Document & {
      startViewTransition?: (cb: () => void) => { finished?: Promise<unknown> }
    }).startViewTransition
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const plainClick =
      e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && target !== '_blank'

    if (!plainClick || reduced || typeof start !== 'function' || typeof href !== 'string') {
      return // let Link handle it normally
    }
    const dest = href

    e.preventDefault()

    // Tag the clicked link's cover (if any) so it morphs into the destination's.
    const coverEl = coverName
      ? (e.currentTarget.querySelector('[data-vt-cover]') as HTMLElement | null)
      : null
    if (coverEl && coverName) coverEl.style.viewTransitionName = coverName

    const transition = start.call(document, () => { router.push(dest) })
    // Clear the name after the transition so it never lingers / collides.
    Promise.resolve(transition?.finished).finally(() => {
      if (coverEl) coverEl.style.viewTransitionName = ''
    })
  }

  return <Link href={href} target={target} onClick={handleClick} {...rest} />
}
