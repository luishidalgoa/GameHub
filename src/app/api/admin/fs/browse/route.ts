import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getSessionFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const HIDDEN = new Set(['$Recycle.Bin', 'System Volume Information', 'Recovery', 'Config.Msi'])

export async function GET(req: NextRequest) {
  const isAdmin = await getSessionFromRequest(req)
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rawPath = new URL(req.url).searchParams.get('path') ?? ''

  // No path → list drives on Windows, or root on Unix
  if (!rawPath) {
    if (process.platform === 'win32') {
      const drives: { name: string; path: string }[] = []
      for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        const p = `${letter}:\\`
        try { fs.accessSync(p); drives.push({ name: p, path: p }) } catch { /* drive not present */ }
      }
      return NextResponse.json({ path: '', parent: null, entries: drives })
    }
    return browse('/')
  }

  return browse(rawPath)
}

function browse(browsePath: string) {
  // Try the path as-is, then NFC / NFD normalized variants. Accented folder
  // names (e.g. "Preservación") can be stored in a different Unicode
  // normalization than what arrives in the URL, which makes readdir throw
  // ENOENT even though the folder exists.
  const attempts = [browsePath]
  for (const form of ['NFC', 'NFD'] as const) {
    try {
      const norm = browsePath.normalize(form)
      if (norm !== browsePath && !attempts.includes(norm)) attempts.push(norm)
    } catch { /* ignore */ }
  }

  let lastErr: NodeJS.ErrnoException | null = null
  for (const p of attempts) {
    try {
      const entries = fs.readdirSync(p, { withFileTypes: true })
      const dirs = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !HIDDEN.has(e.name))
        .map((e) => ({ name: e.name, path: path.join(p, e.name) }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

      const parent = path.dirname(p) === p ? null : path.dirname(p)
      return NextResponse.json({ path: p, parent, entries: dirs })
    } catch (err) {
      lastErr = err as NodeJS.ErrnoException
    }
  }

  // Surface the real reason so it's debuggable (ENOENT / EACCES / ENOTDIR…)
  return NextResponse.json(
    { error: 'Cannot read directory', code: lastErr?.code ?? 'EUNKNOWN', path: browsePath },
    { status: 400 },
  )
}
