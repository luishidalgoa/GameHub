import type { OnlineEntry } from './providers'

/**
 * Catálogo de juego en línea de Nextendo: lista firmada (Ed25519) que el servicio publica y que
 * la sincronización lee cada día. Un juego nuevo aparece en el siguiente sincronizado, sin tocar
 * el código. Cada juego trae sus Title IDs, su versión exigida y si está activo.
 */
export const NEXTENDO_CATALOG_URL = 'https://nextendo.network/service-catalog/v1/game-catalog'
const CATALOG_KEY_ID = 'catalog-key-1'
// Mitad pública de catalog-key-1 (la misma que usa citron-nextendo).
const CATALOG_PUBLIC_KEY = 'xI+atR6VesrCH89ZDZD4t3WQLcYOFEhk5F0HLMzgWk4='

interface NextendoGame {
  title_ids: string[]
  name?: string
  enabled?: boolean
  versions?: { policy?: string; accepted?: string[]; recommended?: string }
}

export interface NextendoCatalogOptions {
  now?: Date
  /** Clave pública en base64 (32 bytes). Por defecto, la de catalog-key-1. */
  publicKey?: string
}

const fromBase64 = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(text), c => c.charCodeAt(0))

/**
 * Comprueba la firma del sobre (Ed25519, con la API Web Crypto: sirve igual en el servidor
 * y en el navegador, así que este módulo no depende de node:crypto) y devuelve el documento.
 */
export async function verifyNextendoEnvelope(text: string, publicKey: string = CATALOG_PUBLIC_KEY): Promise<unknown> {
  const envelope = JSON.parse(text) as { key_id?: unknown; payload?: unknown; signature?: unknown }
  if (envelope.key_id !== CATALOG_KEY_ID) throw new Error('clave de firma desconocida')
  if (typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string') {
    throw new Error('sobre sin payload o firma')
  }
  const payload = fromBase64(envelope.payload)
  const signature = fromBase64(envelope.signature)
  const key = fromBase64(publicKey)
  if (key.length !== 32 || signature.length !== 64) throw new Error('tamaño de clave o firma incorrecto')
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'Ed25519' }, false, ['verify'])
  if (!(await crypto.subtle.verify('Ed25519', cryptoKey, signature, payload))) throw new Error('firma no válida')
  return JSON.parse(new TextDecoder().decode(payload))
}

/**
 * Juegos activos del catálogo firmado, uno por Title ID. Rechaza un documento de otro tipo,
 * de otra versión de esquema, sin revisión o caducado.
 */
export async function parseNextendoCatalog(text: string, options: NextendoCatalogOptions = {}): Promise<OnlineEntry[]> {
  const doc = await verifyNextendoEnvelope(text, options.publicKey) as {
    document_type?: unknown
    schema_version?: unknown
    revision?: unknown
    expires_at?: unknown
    games?: unknown
  }
  if (doc.document_type !== 'game_catalog' || doc.schema_version !== 1) throw new Error('documento de otro tipo')
  if (typeof doc.revision !== 'number' || doc.revision <= 0) throw new Error('sin revisión')
  const now = options.now ?? new Date()
  if (typeof doc.expires_at !== 'string' || Date.parse(doc.expires_at) <= now.getTime()) {
    throw new Error('catálogo caducado')
  }
  if (!Array.isArray(doc.games)) throw new Error('sin lista de juegos')

  const byId = new Map<string, OnlineEntry>()
  for (const game of doc.games as NextendoGame[]) {
    if (game.enabled === false || !Array.isArray(game.title_ids)) continue
    const version = game.versions?.policy === 'exact'
      ? (game.versions.recommended ?? game.versions.accepted?.[0] ?? null)
      : null
    for (const id of game.title_ids) {
      if (typeof id !== 'string' || !/^[0-9a-fA-F]{16}$/.test(id)) continue
      const titleId = id.toUpperCase()
      if (byId.has(titleId)) continue
      byId.set(titleId, {
        titleId,
        status: 'compatible',
        requiredVersion: version,
        name: game.name?.trim() || null,
      })
    }
  }
  return [...byId.values()]
}
