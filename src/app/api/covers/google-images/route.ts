import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export interface ImageSearchResult {
  link:      string
  thumbnail: string
  title:     string
  width:     number
  height:    number
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ error: 'Missing q' }, { status: 400 })

  const dbSetting = await db.setting.findUnique({ where: { key: 'bing_image_key' } })
  const apiKey    = dbSetting?.value || process.env.BING_IMAGE_KEY

  if (!apiKey) {
    return NextResponse.json(
      { error: 'not_configured', message: 'Configure Bing Image Search Key in Admin → Settings' },
      { status: 503 },
    )
  }

  const url = new URL('https://api.bing.microsoft.com/v7.0/images/search')
  url.searchParams.set('q', `${q} game cover`)
  url.searchParams.set('count', '10')
  url.searchParams.set('imageType', 'Photo')
  url.searchParams.set('safeSearch', 'Moderate')

  const res  = await fetch(url.toString(), {
    headers: { 'Ocp-Apim-Subscription-Key': apiKey },
  })
  const data = await res.json()

  if (!res.ok) {
    return NextResponse.json(
      { error: data.error?.message ?? 'Bing API error' },
      { status: res.status },
    )
  }

  const results: ImageSearchResult[] = (data.value ?? []).map((item: any) => ({
    link:      item.contentUrl,
    thumbnail: item.thumbnailUrl,
    title:     item.name,
    width:     item.width  ?? 0,
    height:    item.height ?? 0,
  }))

  return NextResponse.json({ results })
}
