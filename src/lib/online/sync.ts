import { db } from '@/lib/db'
import { ONLINE_SOURCES, type OnlineSource } from './providers'

/**
 * Pone al día la compatibilidad de cada proveedor desde su fuente. Una fuente que falla
 * no toca sus filas anteriores (se conserva la última lista buena) y no para a las demás.
 */
export async function syncOnlineSupport(sources: OnlineSource[] = ONLINE_SOURCES) {
  const counts: Record<string, number> = {}
  const errors: Record<string, string> = {}
  for (const source of sources) {
    try {
      const entries = await source.load()
      if (entries.length === 0) throw new Error('la fuente no trae ningún juego')
      const syncedAt = new Date()
      await db.$transaction([
        db.onlineSupport.deleteMany({ where: { provider: source.key } }),
        db.onlineSupport.createMany({ data: entries.map(e => ({ ...e, provider: source.key, syncedAt })) }),
      ])
      counts[source.key] = entries.length
    } catch (err) {
      errors[source.key] = err instanceof Error ? err.message : String(err)
      console.error(`[online] ${source.label}: ${errors[source.key]}`)
    }
  }
  return { counts, errors }
}
