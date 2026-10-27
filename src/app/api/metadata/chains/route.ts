import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { adminGuard } from '@/lib/admin-guard'
import { CHAIN_FIELDS, optionsFor, type ProviderChains } from '@/lib/metadata/chains'

export const dynamic = 'force-dynamic'

const GLOBAL_KEY = 'provider_chains'

/**
 * A complete set of chains: every field a list, and only the sources that field can use
 * for this scope. A bad entry rejects the whole set, so a half-saved chain never reaches
 * the engine.
 */
function validate(input: unknown, slug: string): { ok: true; chains: ProviderChains } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'chains debe ser un objeto' }
  const out: Partial<ProviderChains> = {}
  for (const field of CHAIN_FIELDS) {
    const list = (input as Record<string, unknown>)[field]
    if (!Array.isArray(list)) return { ok: false, error: `${field}: debe ser una lista` }
    const allowed = optionsFor(field, slug) as readonly string[]
    const bad = list.find(v => typeof v !== 'string' || !allowed.includes(v))
    if (bad !== undefined) return { ok: false, error: `${field}: fuente no válida (${String(bad)})` }
    ;(out as Record<string, unknown>)[field] = [...new Set(list as string[])]
  }
  return { ok: true, chains: out as ProviderChains }
}

// PUT /api/metadata/chains
//   { scope: 'global', chains }                    → the default chains for every platform
//   { scope: 'platform', slug, chains | null }     → one platform's own chains; null = inherit
export async function PUT(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied
  const body = await req.json().catch(() => null) as { scope?: string; slug?: string; chains?: unknown } | null
  if (!body) return NextResponse.json({ error: 'cuerpo no válido' }, { status: 400 })

  if (body.scope === 'global') {
    const checked = validate(body.chains, 'global')
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
    await db.setting.upsert({
      where:  { key: GLOBAL_KEY },
      update: { value: JSON.stringify(checked.chains) },
      create: { key: GLOBAL_KEY, value: JSON.stringify(checked.chains) },
    })
    return NextResponse.json({ ok: true })
  }

  if (body.scope === 'platform' && typeof body.slug === 'string') {
    const platform = await db.platform.findUnique({ where: { slug: body.slug }, select: { id: true } })
    if (!platform) return NextResponse.json({ error: 'plataforma no encontrada' }, { status: 404 })
    if (body.chains === null) {
      await db.platform.update({
        where: { id: platform.id },
        data: { providerChains: null, providerCover: null, providerInfo: null, providerDescription: null, providerScreenshots: null },
      })
      return NextResponse.json({ ok: true })
    }
    const checked = validate(body.chains, body.slug)
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
    // The chains replace the old single-source columns, so one place says what the platform asks.
    await db.platform.update({
      where: { id: platform.id },
      data: {
        providerChains:      JSON.stringify(checked.chains),
        providerCover:       null,
        providerInfo:        null,
        providerDescription: null,
        providerScreenshots: null,
      },
    })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'scope no válido' }, { status: 400 })
}
