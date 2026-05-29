import { db } from '@/lib/db'

/** Thrown when the YouTube API itself fails (quota, bad key, network) — as
 *  opposed to simply finding no matching video. Lets batch jobs stop hammering
 *  a broken API instead of silently treating every game as "no trailer". */
export class YouTubeApiError extends Error {}

/**
 * Returns the trailer URL, or null when there's no API key / no matching video.
 * Throws YouTubeApiError when the API call fails (so callers can disable further
 * trailer lookups). Existing callers that `.catch()` keep working unchanged.
 */
export async function searchYouTubeTrailer(title: string): Promise<string | null> {
  const dbSettings = await db.setting.findMany({
    where: { key: { in: ['youtube_api_key', 'google_search_api_key'] } },
  })
  const dbMap = Object.fromEntries(dbSettings.map((s) => [s.key, s.value]))

  const apiKey =
    dbMap['youtube_api_key'] ||
    dbMap['google_search_api_key'] ||
    process.env.YOUTUBE_API_KEY ||
    process.env.GOOGLE_SEARCH_API_KEY

  if (!apiKey) return null   // no key → trailers simply unavailable, not an error

  const url = new URL('https://www.googleapis.com/youtube/v3/search')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('q', `${title} official trailer`)
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('type', 'video')
  url.searchParams.set('maxResults', '1')
  url.searchParams.set('videoCategoryId', '20')

  let res: Response
  try {
    res = await fetch(url.toString())
  } catch (err) {
    throw new YouTubeApiError(`network error: ${err instanceof Error ? err.message : 'unknown'}`)
  }
  if (!res.ok) {
    // 403 (quota/disabled), 400 (bad key), etc. → real API failure
    throw new YouTubeApiError(`HTTP ${res.status}`)
  }

  const data    = await res.json()
  const videoId = data.items?.[0]?.id?.videoId
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null
}
