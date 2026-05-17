import { db } from '@/lib/db'

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

  if (!apiKey) return null

  const url = new URL('https://www.googleapis.com/youtube/v3/search')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('q', `${title} official trailer`)
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('type', 'video')
  url.searchParams.set('maxResults', '1')
  url.searchParams.set('videoCategoryId', '20')

  try {
    const res = await fetch(url.toString())
    if (!res.ok) return null
    const data = await res.json()
    const videoId = data.items?.[0]?.id?.videoId
    return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null
  } catch {
    return null
  }
}
