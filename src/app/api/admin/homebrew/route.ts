import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { adminGuard } from '@/lib/admin-guard'
import { providerFetch } from '@/lib/metadata/http'
import {
  HOMEBREW_SETTING_KEY,
  isValidRepoName,
  nroFiles,
  parseStoredRepos,
  serializeRepos,
  type ReleaseAsset,
} from '@/lib/homebrew-repos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PROGRAMS_TTL_MS = 10 * 60_000
const programsCache = new Map<string, { at: number; programs: Array<{ name: string; url: string }> }>()

async function storedRepos(): Promise<string[]> {
  const row = await db.setting.findUnique({ where: { key: HOMEBREW_SETTING_KEY } })
  return parseStoredRepos(row?.value)
}

async function saveRepos(repos: string[]): Promise<void> {
  const value = serializeRepos(repos)
  await db.setting.upsert({
    where: { key: HOMEBREW_SETTING_KEY },
    update: { value },
    create: { key: HOMEBREW_SETTING_KEY, value },
  })
}

/** The .nro files of the repo's latest release, cached for a few minutes. */
async function programsOf(repo: string): Promise<{ programs?: Array<{ name: string; url: string }>; error?: string }> {
  const hit = programsCache.get(repo)
  if (hit && Date.now() - hit.at < PROGRAMS_TTL_MS) return { programs: hit.programs }
  try {
    const res = await providerFetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (res.status === 404) return { error: 'Sin releases publicadas' }
    if (!res.ok) return { error: `GitHub respondió ${res.status}` }
    const release = (await res.json()) as { assets?: ReleaseAsset[] }
    const programs = nroFiles(release.assets ?? [])
    programsCache.set(repo, { at: Date.now(), programs })
    return { programs }
  } catch {
    return { error: 'No se pudo consultar GitHub' }
  }
}

async function repoExists(repo: string): Promise<boolean> {
  const res = await providerFetch(`https://api.github.com/repos/${repo}`, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  return res.ok
}

/** GET: the repos and, for each, the programs in its latest release (read only). */
export async function GET() {
  const denied = await adminGuard()
  if (denied) return denied

  const repos = await storedRepos()
  const entries = await Promise.all(
    repos.map(async (repo) => ({
      repo,
      url: `https://github.com/${repo}`,
      ...(await programsOf(repo)),
    })),
  )
  return NextResponse.json({ repos: entries })
}

/** POST { repo }: adds a repo, once GitHub confirms it exists. */
export async function POST(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied

  const body = (await req.json().catch(() => null)) as { repo?: unknown } | null
  const repo = typeof body?.repo === 'string' ? body.repo.trim() : ''
  if (!isValidRepoName(repo)) {
    return NextResponse.json({ error: 'Escribe el repo como owner/nombre' }, { status: 400 })
  }

  const current = await storedRepos()
  if (current.includes(repo)) {
    return NextResponse.json({ error: 'Ese repo ya está en la lista' }, { status: 409 })
  }

  try {
    if (!(await repoExists(repo))) {
      return NextResponse.json({ error: 'GitHub no encuentra ese repo' }, { status: 404 })
    }
  } catch {
    return NextResponse.json({ error: 'No se pudo consultar GitHub' }, { status: 502 })
  }

  await saveRepos([...current, repo])
  return NextResponse.json({ ok: true, repo }, { status: 201 })
}

/** DELETE { repo }: removes a repo from the list. */
export async function DELETE(req: Request) {
  const denied = await adminGuard()
  if (denied) return denied

  const body = (await req.json().catch(() => null)) as { repo?: unknown } | null
  const repo = typeof body?.repo === 'string' ? body.repo : ''
  const current = await storedRepos()
  if (!current.includes(repo)) {
    return NextResponse.json({ error: 'Ese repo no está en la lista' }, { status: 404 })
  }

  await saveRepos(current.filter((r) => r !== repo))
  programsCache.delete(repo)
  return NextResponse.json({ ok: true })
}
