import { adminGuard } from '@/lib/admin-guard'
import { NextResponse } from 'next/server'
import { rankedPublishers } from '@/lib/home-data'
import { clearCharacter, ensurePublisherLogos, getPublisherArt, saveCharacter, saveLayout, saveLogo } from '@/lib/publisher-art'

export const dynamic = 'force-dynamic'

const g = globalThis as typeof globalThis & { __publisherLogosRunning?: boolean }
const MAX_UPLOAD = 8 * 1024 * 1024
const LIST_SIZE = 60

// The publishers of the home rail with their art, and whether a logo search is running.
export async function GET() {
  const denied = await adminGuard()
  if (denied) return denied
  const [ranked, art] = await Promise.all([rankedPublishers(LIST_SIZE), getPublisherArt()])
  return NextResponse.json({
    running: g.__publisherLogosRunning === true,
    publishers: ranked.map(p => ({ key: p.key, name: p.name, games: p.games, art: art[p.key] ?? null })),
  })
}

// POST { force?: boolean } — look the logos up on Wikidata, in the background.
export async function POST(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied
  if (g.__publisherLogosRunning) return NextResponse.json({ ok: true, running: true })
  const body = await req.json().catch(() => ({})) as { force?: boolean }
  const ranked = await rankedPublishers(LIST_SIZE)
  g.__publisherLogosRunning = true
  void ensurePublisherLogos(ranked, { force: body.force === true })
    .catch(() => {})
    .finally(() => { g.__publisherLogosRunning = false })
  return NextResponse.json({ ok: true, running: true })
}

// PUT multipart { key, kind: 'character' | 'logo', file } — upload a character cut-out or replace the logo.
export async function PUT(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied
  const form = await req.formData().catch(() => null)
  const key = form?.get('key')
  const file = form?.get('file')
  const kind = form?.get('kind') === 'logo' ? 'logo' : 'character'
  if (typeof key !== 'string' || !(file instanceof File)) {
    return NextResponse.json({ error: 'key and file are required' }, { status: 400 })
  }
  if (file.size > MAX_UPLOAD) return NextResponse.json({ error: 'file too large' }, { status: 413 })
  const publisher = (await rankedPublishers(LIST_SIZE)).find(p => p.key === key)
  if (!publisher) return NextResponse.json({ error: 'unknown publisher' }, { status: 404 })
  try {
    const image = Buffer.from(await file.arrayBuffer())
    return NextResponse.json({ art: kind === 'logo' ? await saveLogo(key, publisher.name, image) : await saveCharacter(key, image) })
  } catch {
    return NextResponse.json({ error: 'not a valid image' }, { status: 400 })
  }
}

// PATCH { key, layout } — where the character and the logo sit in the tile (the owner's arrangement).
export async function PATCH(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied
  const body = await req.json().catch(() => ({})) as { key?: unknown; layout?: unknown }
  if (typeof body.key !== 'string') return NextResponse.json({ error: 'key is required' }, { status: 400 })
  const publisher = (await rankedPublishers(LIST_SIZE)).find(p => p.key === body.key)
  if (!publisher) return NextResponse.json({ error: 'unknown publisher' }, { status: 404 })
  return NextResponse.json({ art: await saveLayout(body.key, body.layout) })
}

// DELETE { key } — remove the character.
export async function DELETE(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied
  const body = await req.json().catch(() => ({})) as { key?: string }
  if (typeof body.key !== 'string') return NextResponse.json({ error: 'key is required' }, { status: 400 })
  return NextResponse.json({ art: await clearCharacter(body.key) })
}
