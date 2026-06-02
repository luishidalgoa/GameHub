'use client'

import { resolveCoverPath } from '@/lib/cover-url'
import { getPlatformIdentity } from '@/lib/platform-identity'

interface Props {
  slug:      string
  iconPath?: string | null
  /** Rendered size in px (square). */
  size:      number
  className?: string
}

/**
 * Platform glyph: shows the admin-uploaded icon (Platform.iconPath) when set,
 * otherwise falls back to the platform's identity emoji. Used in the home cards
 * and the sidebar nav so both share one rendering path.
 */
export function PlatformIcon({ slug, iconPath, size, className = '' }: Props) {
  const src = resolveCoverPath(iconPath)
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={`object-contain select-none ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      className={`inline-flex items-center justify-center leading-none select-none ${className}`}
      style={{ fontSize: size * 0.9, width: size, height: size }}
    >
      {getPlatformIdentity(slug).emoji}
    </span>
  )
}
