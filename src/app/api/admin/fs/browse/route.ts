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
  try {
    const entries = fs.readdirSync(browsePath, { withFileTypes: true })
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !HIDDEN.has(e.name))
      .map((e) => ({ name: e.name, path: path.join(browsePath, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

    const parent = path.dirname(browsePath) === browsePath ? null : path.dirname(browsePath)
    return NextResponse.json({ path: browsePath, parent, entries: dirs })
  } catch {
    return NextResponse.json({ error: 'Cannot read directory' }, { status: 400 })
  }
}
