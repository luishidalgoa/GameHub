import type { OnlineEntry } from './providers'

/**
 * Lee la tabla de títulos compatibles de Nextendo (citron-nextendo,
 * src/common/nextendo_compatible_titles.h). Cada línea es
 * `{0x<Title ID>, "<versión exigida>"},  // <nombre>`. Sin tabla no hay nada que leer:
 * devuelve la lista vacía y la sincronización lo trata como error.
 */
export function parseNextendoTitles(text: string): OnlineEntry[] {
  const entries: OnlineEntry[] = []
  const line = /\{\s*0x([0-9a-fA-F]{16})\s*,\s*"([^"]+)"\s*\}\s*,?\s*(?:\/\/\s*(.*))?$/
  for (const raw of text.split('\n')) {
    const m = raw.match(line)
    if (!m) continue
    entries.push({
      titleId: m[1].toUpperCase(),
      status: 'compatible',
      requiredVersion: m[2],
      name: m[3]?.trim() || null,
    })
  }
  return entries
}
