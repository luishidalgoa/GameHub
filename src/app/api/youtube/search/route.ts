import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export interface YoutubeVideoResult {
  videoId:   string
  title:     string
  channel:   string
  thumbnail: string
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ error: 'Missing q' }, { status: 400 })

  // DB setting takes precedence over env var — reuses the same Google API key
  const dbSettings = await db.setting.findMany({
    where: { key: { in: ['youtube_api_key', 'google_search_api_key'] } },
  })
  const dbMap = Object.fromEntries(dbSettings.map((s) => [s.key, s.value]))

  const apiKey =
    dbMap['youtube_api_key'] ||
    dbMap['google_search_api_key'] ||
    process.env.YOUTUBE_API_KEY ||
    process.env.GOOGLE_SEARCH_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      { error: 'not_configured', message: 'Configure a Google/YouTube API Key in Admin → Settings' },
      { status: 503 },
    )
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/search')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('q', q)
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('type', 'video')
  url.searchParams.set('maxResults', '8')
  url.searchParams.set('videoCategoryId', '20') // Gaming category

  const res  = await fetch(url.toString())
  const data = await res.json()

  if (!res.ok) {
    return NextResponse.json(
      { error: data.error?.message ?? 'YouTube API error', code: data.error?.code },
      { status: res.status },
    )
  }

  const results: YoutubeVideoResult[] = (data.items ?? []).map((item: any) => ({
    videoId:   item.id.videoId,
    title:     item.snippet.title,
    channel:   item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url ?? '',
  }))

  return NextResponse.json({ results })
}
