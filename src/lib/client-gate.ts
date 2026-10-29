/**
 * Versión mínima de GameHubNX que acepta las descargas. Apagada por defecto: sin valor en el
 * ajuste, nadie se bloquea. Cuando el ajuste tenga un valor, las consolas con una versión anterior
 * reciben 426 en lugar del archivo, y la app debe pedir la actualización.
 *
 * Las versiones son «major.minor.patch». Un cliente sin versión conocida (un build de desarrollo,
 * «dev») cuenta como anterior en cuanto hay mínimo: un build sin versión no puede demostrar que lo es.
 * Los navegadores y otros clientes no se miran: esta regla es solo para GameHubNX.
 */

export const MIN_CLIENT_VERSION_SETTING = 'min_client_version'

/** Versión de GameHubNX que manda la petición, o null si no es GameHubNX. */
export function clientVersionOf(header: string | null | undefined): string | null {
  if (!header) return null
  const match = /^GameHubNX\/(\S+)/.exec(header.trim())
  return match ? match[1] : null
}

/** «1.2.3» → [1, 2, 3]. Null si no es una versión de ese tipo. */
export function parseVersion(v: string): number[] | null {
  const parts = v.split('.')
  if (parts.length === 0 || parts.length > 3) return null
  const nums = parts.map(p => (/^\d+$/.test(p) ? Number(p) : NaN))
  if (nums.some(n => Number.isNaN(n))) return null
  while (nums.length < 3) nums.push(0)
  return nums
}

/**
 * True si la versión del cliente es menor que el mínimo. Sin mínimo nunca bloquea. Una versión
 * desconocida o no numérica cuenta como anterior.
 */
export function belowMinimum(clientVersion: string, minimum: string): boolean {
  const min = parseVersion(minimum.trim())
  if (!min) return false
  const have = parseVersion(clientVersion)
  if (!have) return true
  for (let i = 0; i < 3; i++) {
    if (have[i] !== min[i]) return have[i] < min[i]
  }
  return false
}

/** Mínimo vigente, leído de la base con una caché de 30 s. Un fallo de lectura no bloquea nada. */
let cached: { minimum: string; at: number } | null = null
const CACHE_MS = 30_000

export async function currentMinimumClientVersion(now: number = Date.now()): Promise<string> {
  if (cached && now - cached.at < CACHE_MS) return cached.minimum
  let minimum = ''
  try {
    const { db } = await import('@/lib/db')
    const row = await db.setting.findUnique({ where: { key: MIN_CLIENT_VERSION_SETTING } })
    minimum = (row?.value ?? '').trim()
  } catch {
    minimum = ''
  }
  cached = { minimum, at: now }
  return minimum
}

/** Para que un cambio en el panel se note sin esperar los 30 s. */
export function invalidateMinimumClientVersionCache(): void {
  cached = null
}

/**
 * El mínimo que le falta a la petición, o null si puede descargar. Solo mira a GameHubNX: el
 * navegador y los demás clientes no pasan nunca por aquí.
 */
export async function requiredClientVersion(req: Request): Promise<string | null> {
  const version = clientVersionOf(req.headers.get('x-gamehub-client') ?? req.headers.get('user-agent'))
  if (version === null) return null
  const minimum = await currentMinimumClientVersion()
  if (!minimum) return null
  return belowMinimum(version, minimum) ? minimum : null
}
