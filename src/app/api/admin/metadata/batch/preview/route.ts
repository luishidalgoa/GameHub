import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { previewBatch, type BatchMode } from '@/lib/metadata/preview'

export const dynamic = 'force-dynamic'

const MODES: BatchMode[] = ['missing', 'fill', 'redo', 'wrong-provider', 'popularity', 'autocomplete-scores']

// GET ?mode=…&platformSlug=… — what the pass would touch, before it runs.
export async function GET(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied
  const url = new URL(req.url)
  const mode = url.searchParams.get('mode') as BatchMode | null
  if (!mode || !MODES.includes(mode)) return NextResponse.json({ error: 'unknown mode' }, { status: 400 })
  const platformSlug = url.searchParams.get('platformSlug') || undefined
  return NextResponse.json(await previewBatch(mode, platformSlug))
}
