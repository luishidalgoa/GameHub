import { NextResponse } from 'next/server'
import { adminGuard } from '@/lib/admin-guard'
import { GAME_ACTIONS, isGameAction, type GameActionName } from '@/lib/games/actions'

export const dynamic = 'force-dynamic'

// One door for the admin's actions on many games (and on the panel's single game):
// POST { action, ids } runs the named strategy from GAME_ACTIONS.
const MAX_IDS = 500

export async function POST(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied

  const body = await req.json().catch(() => ({}))
  if (!isGameAction(body.action)) {
    return NextResponse.json({ error: 'unknown_action' }, { status: 400 })
  }
  const ids: number[] = Array.isArray(body.ids)
    ? [...new Set(body.ids.map((x: unknown) => Number(x)).filter((n: number) => Number.isInteger(n) && n > 0))] as number[]
    : []
  if (ids.length === 0) return NextResponse.json({ error: 'no_ids' }, { status: 400 })
  if (ids.length > MAX_IDS) return NextResponse.json({ error: 'too_many', max: MAX_IDS }, { status: 400 })

  const action: GameActionName = body.action
  const result = await GAME_ACTIONS[action].run(ids)
  return NextResponse.json({ ok: true, action, ...result })
}
