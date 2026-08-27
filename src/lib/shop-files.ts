/**
 * File-level helpers for the shop routes.
 *
 * The index has to answer "does this file still exist, and how big is it?" for
 * the whole library on every request. The previous implementation called
 * `fs.existsSync` once per game inside the handler: on a bind-mounted `/mnt`
 * (USB disk or network share) each of those blocks the event loop, so a large
 * library both answered slowly and stalled every other request meanwhile.
 * `statSize` does the same work asynchronously, bounded in concurrency.
 */
import fsp from 'fs/promises'

const SWITCH_EXTS = new Set(['.nsp', '.nsz', '.xci', '.xcz'])

/** True for the container formats a Switch install client can consume. */
export function isSwitchFile(fileName: string): boolean {
  const dot = fileName.lastIndexOf('.')
  if (dot < 0) return false
  return SWITCH_EXTS.has(fileName.slice(dot).toLowerCase())
}

/**
 * Nombre con el que la tienda sirve un fichero, con su Title ID dentro.
 *
 * La consola saca el Title ID del ULTIMO SEGMENTO DE LA URL, no de ningun campo
 * del indice: es lo que usa para cruzar el juego con su titledb (y por tanto
 * para tener caratula) y para saber de que juego es un DLC. Cuando el fichero
 * del disco no lo lleva en el nombre, el juego sale sin caratula y sus
 * complementos quedan huerfanos.
 *
 * Aqui se le pega el que tenga guardado en la base de datos. NO se renombra
 * nada en el disco: la descarga se resuelve por id --/download/[id]/[filename]
 * ignora el nombre-- asi que el segmento es libre y sirve justamente para esto.
 *
 * Si el nombre ya trae un Title ID, o no hay ninguno guardado, se devuelve tal
 * cual.
 */
export function shopFileName(fileName: string, titleId?: string | null): string {
  if (!titleId) return fileName
  const id = titleId.trim().toUpperCase()
  if (!/^[0-9A-F]{16}$/.test(id)) return fileName
  if (fileName.toUpperCase().includes(id)) return fileName

  const dot = fileName.lastIndexOf('.')
  if (dot <= 0) return `${fileName} [${id}]`
  return `${fileName.slice(0, dot)} [${id}]${fileName.slice(dot)}`
}

/** How many stat() calls may be in flight — enough to hide latency, low enough
 *  not to thrash a spinning disk or a single-queue network share. */
const STAT_CONCURRENCY = 32

/**
 * Real byte size of each path, in the same order.
 * `null` means missing, unreadable, or not a regular file.
 */
export async function statSize(paths: readonly string[]): Promise<(number | null)[]> {
  const out = new Array<number | null>(paths.length).fill(null)
  let next = 0

  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++
      if (i >= paths.length) return
      try {
        const st = await fsp.stat(paths[i])
        out[i] = st.isFile() ? st.size : null
      } catch {
        out[i] = null
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(STAT_CONCURRENCY, paths.length) }, worker),
  )
  return out
}
