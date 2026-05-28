'use client'

import { ExternalLink } from 'lucide-react'

/** Extract an 11-char YouTube video id from any common URL shape. */
export function getYouTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/))([a-zA-Z0-9_-]{11})/,
  )
  return m?.[1] ?? null
}

interface Props {
  url: string
  /** Wrapper classes (controls aspect ratio / rounding). */
  className?: string
  /** Label for the fallback link when the URL isn't a YouTube video. */
  watchLabel?: string
}

/**
 * Embeds a YouTube trailer.
 *
 * The `referrerPolicy="strict-origin-when-cross-origin"` attribute is the fix
 * for YouTube "Error 153 — Video player configuration error"
 * (embedder.identity.missing.referrer): the player needs the origin sent as the
 * HTTP Referer, and without this the embed fails. We intentionally do NOT pass
 * an `origin` query param — it's only needed with the JS IFrame API and an empty
 * value (e.g. during SSR) triggers the very error we're fixing.
 */
export function YouTubeEmbed({ url, className, watchLabel = 'Ver vídeo' }: Props) {
  const videoId = getYouTubeId(url)

  if (!videoId) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
      >
        <ExternalLink className="w-4 h-4" />
        {watchLabel}
      </a>
    )
  }

  return (
    <div className={className ?? 'aspect-video rounded-lg overflow-hidden'}>
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        title="YouTube video player"
        className="w-full h-full"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  )
}
