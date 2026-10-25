import { fetchJson, fetchText } from './fetch'
import type { OnlineEntry } from './providers'

const REPO = 'PretendoNetwork/nex-viewer'
const TREE_URL = `https://api.github.com/repos/${REPO}/git/trees/HEAD?recursive=1`
const RAW_URL = `https://raw.githubusercontent.com/${REPO}/HEAD/`
const TITLE_FILE = /^src\/nex\/titles\/[^/]+\.ts$/
const CONCURRENCY = 8

/**
 * Lee un fichero de título de Pretendo (nex-viewer, src/nex/titles/<juego>.ts): su nombre
 * y sus Title IDs. Solo los de 3DS (0004...); las actualizaciones y los DLC (0004000E,
 * 0004008C) se llevan a su juego base, que es como lo guarda GameHub.
 */
export function parsePretendoTitle(text: string): { name: string | null; titleIds: string[] } {
  const name = text.match(/displayName\s*=\s*'([^']*)'/)?.[1]?.trim() || null
  const list = text.match(/titleIDs\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? ''
  const ids = new Set<string>()
  for (const m of list.matchAll(/'([0-9A-Fa-f]{16})'/g)) {
    const base = toBase3dsTitleId(m[1])
    if (base) ids.add(base)
  }
  return { name, titleIds: [...ids] }
}

/** El Title ID base de un 3DS, o null si no es de 3DS. */
export function toBase3dsTitleId(id: string): string | null {
  const up = id.toUpperCase()
  if (up.startsWith('0004000E') || up.startsWith('0004008C')) return `00040000${up.slice(8)}`
  return up.startsWith('00040000') ? up : null
}

/** Todos los títulos 3DS que nex-viewer modela, con su nombre. */
export async function loadPretendoTitles(): Promise<OnlineEntry[]> {
  const tree = await fetchJson<{ tree: { path: string }[] }>(TREE_URL)
  const files = tree.tree.map(t => t.path).filter(p => TITLE_FILE.test(p) && !/\/(index|title)\.ts$/.test(p))

  const byId = new Map<string, OnlineEntry>()
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = await Promise.all(files.slice(i, i + CONCURRENCY).map(p => fetchText(RAW_URL + p)))
    for (const text of batch) {
      const { name, titleIds } = parsePretendoTitle(text)
      for (const titleId of titleIds) {
        if (!byId.has(titleId)) byId.set(titleId, { titleId, status: 'compatible', requiredVersion: null, name })
      }
    }
  }
  return [...byId.values()]
}
