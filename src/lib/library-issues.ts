/**
 * Comprobaciones de integridad de la biblioteca.
 *
 * Lo que buscan tiene un patron comun: filas que la web afirma y que no se
 * sostienen. Un parche catalogado como juego dice que hay algo jugable que no
 * lo es; una ficha cuyo fichero no se puede leer dice que hay algo descargable
 * que no esta.
 *
 * Los dos casos salieron a la luz por el mismo sintoma: la web contaba 69
 * juegos de Switch, /api/shop servia 68 y la consola mostraba 67.
 */
import { db } from '@/lib/db'
import { statSize } from '@/lib/shop-files'
import { extractSwitchTitleId, classifySwitchTitleId } from '@/lib/scanner/titleid'

export type LibraryIssueKind = 'update' | 'dlc' | 'unreadable'

export interface LibraryIssue {
  id:        number
  title:     string
  fileName:  string
  filePath:  string
  platform:  string
  kind:      LibraryIssueKind
  detail:    string
}

export interface LibraryIssues {
  issues:  LibraryIssue[]
  scanned: number
}

/**
 * Recorre la biblioteca entera y devuelve lo que no cuadra.
 *
 * Hace un stat por juego, asi que NO vale para una ruta que se llame en cada
 * peticion: es una comprobacion que se pide a mano desde el panel. `statSize`
 * limita la concurrencia, que en un disco USB o una carpeta de red es la
 * diferencia entre tardar y bloquear el servidor.
 */
export async function findLibraryIssues(): Promise<LibraryIssues> {
  const games = await db.game.findMany({
    where:  { isHidden: false },
    select: {
      id: true, title: true, fileName: true, filePath: true, titleId: true,
      platform: { select: { slug: true, name: true } },
    },
  })

  const sizes = await statSize(games.map((g) => g.filePath))
  const issues: LibraryIssue[] = []

  games.forEach((game, i) => {
    const platform = game.platform?.name ?? '—'

    // Ilegible manda sobre lo demas: si el fichero no esta, que ademas sea un
    // parche es lo de menos.
    if (sizes[i] === null || sizes[i] === 0) {
      issues.push({
        id: game.id, title: game.title, fileName: game.fileName,
        filePath: game.filePath, platform, kind: 'unreadable',
        detail: 'El fichero no se puede leer en disco',
      })
      return
    }

    // Los Title ID son de Switch: en las demas plataformas no hay nada que
    // clasificar y preguntarlo daria falsos positivos.
    if (game.platform?.slug !== 'switch') return

    const tid = extractSwitchTitleId(game.fileName) ?? game.titleId
    if (!tid) return
    const kind = classifySwitchTitleId(tid.toUpperCase())
    if (kind === 'base') return

    issues.push({
      id: game.id, title: game.title, fileName: game.fileName,
      filePath: game.filePath, platform, kind,
      detail: kind === 'update'
        ? `Es una actualizacion (${tid.toUpperCase()}), no un juego base`
        : `Es un DLC (${tid.toUpperCase()}), no un juego base`,
    })
  })

  return { issues, scanned: games.length }
}
