import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { previewBatch } from '@/lib/metadata/preview'
import { isBatchField, isBatchMode, type BatchField } from '@/lib/metadata/scope'
import { clampCoverScale } from '@/lib/metadata/field-quality'

export const dynamic = 'force-dynamic'

// GET ?mode=…&platformSlug=…&fields=title,score&withScores=…&popularityRedo=… —
// what the pass would touch, before it runs.
export async function GET(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied
  const url = new URL(req.url)
  const mode = url.searchParams.get('mode')
  if (!isBatchMode(mode)) return NextResponse.json({ error: 'unknown mode' }, { status: 400 })
  const platformSlug = url.searchParams.get('platformSlug') || undefined
  const fieldsParam = url.searchParams.get('fields')
  const fields = fieldsParam === null ? undefined : fieldsParam.split(',').filter(isBatchField) as BatchField[]
  return NextResponse.json(await previewBatch(mode, {
    platformSlug,
    fields,
    withScores: url.searchParams.get('withScores') !== 'false',
    popularityRedo: url.searchParams.get('popularityRedo') === 'true',
    coverMinScale: clampCoverScale(url.searchParams.get('coverMinScale')),
  }))
}
