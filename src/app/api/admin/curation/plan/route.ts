import { NextResponse } from 'next/server'
import { mkdir, writeFile, readdir } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'
import { validateProposedName } from '@/lib/curation'

export const dynamic = 'force-dynamic'

interface PlanItem {
  id: number
  proposedName: string
}

/**
 * Where approved plans are dropped for the host-side applier to pick up.
 * Derived from DATABASE_URL so it follows the data volume wherever it is
 * mounted; `/data` is the value in the shipped compose file.
 */
function planDir(): string {
  const url = process.env.DATABASE_URL ?? ''
  const file = url.replace(/^file:/, '').split('?')[0]
  const base = file ? path.dirname(path.resolve(file)) : '/data'
  return path.join(base, 'curation')
}

/**
 * Accept a reviewed set of renames and write it out as a plan.
 *
 * This deliberately does NOT rename anything. The library is mounted read-only
 * inside the container, and it stays that way: an app reachable from the public
 * internet has no business holding write access to an unbacked-up 1.3 TB of
 * ROMs. The host applier validates every entry again before acting — nothing
 * here is treated as trusted input downstream.
 */
export async function POST(req: Request) {
  let body: { items?: PlanItem[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const items = Array.isArray(body.items) ? body.items : []
  if (items.length === 0) {
    return NextResponse.json({ error: 'No items to apply' }, { status: 400 })
  }
  if (items.length > 5000) {
    return NextResponse.json({ error: 'Too many items' }, { status: 400 })
  }

  const games = await db.game.findMany({
    where: { id: { in: items.map(i => Number(i.id)).filter(Number.isInteger) } },
    select: { id: true, fileName: true, filePath: true },
  })
  const byId = new Map(games.map(g => [g.id, g]))

  const entries: Array<{
    id: number
    fromPath: string
    fromName: string
    toName: string
    toPath: string
  }> = []
  const rejected: Array<{ id: number; reason: string }> = []
  const seenTargets = new Set<string>()

  for (const item of items) {
    const game = byId.get(Number(item.id))
    if (!game) {
      rejected.push({ id: Number(item.id), reason: 'unknown-game' })
      continue
    }
    const toName = String(item.proposedName ?? '').trim()
    const bad = validateProposedName(game.fileName, toName)
    if (bad) {
      rejected.push({ id: game.id, reason: bad })
      continue
    }
    if (toName === game.fileName) {
      rejected.push({ id: game.id, reason: 'unchanged' })
      continue
    }
    const toPath = path.join(path.dirname(game.filePath), toName)
    // Two entries renaming to the same path would silently destroy one file.
    if (seenTargets.has(toPath)) {
      rejected.push({ id: game.id, reason: 'duplicate-target' })
      continue
    }
    seenTargets.add(toPath)
    entries.push({
      id: game.id,
      fromPath: game.filePath,
      fromName: game.fileName,
      toName,
      toPath,
    })
  }

  if (entries.length === 0) {
    return NextResponse.json(
      { error: 'Nothing valid to apply', rejected },
      { status: 400 },
    )
  }

  const dir = planDir()
  await mkdir(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const name = `plan-${stamp}.json`
  const plan = {
    version: 1,
    createdAt: new Date().toISOString(),
    entries,
  }

  // Write to a temp name first, then rename into place: the applier watches
  // this directory, and a half-written plan must never be visible to it.
  const tmp = path.join(dir, `.${name}.tmp`)
  await writeFile(tmp, JSON.stringify(plan, null, 2), 'utf8')
  const { rename } = await import('fs/promises')
  await rename(tmp, path.join(dir, name))

  const pending = (await readdir(dir)).filter(f => f.startsWith('plan-')).length

  return NextResponse.json({
    plan: name,
    accepted: entries.length,
    rejected,
    pendingPlans: pending,
  })
}
