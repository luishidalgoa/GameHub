/**
 * Divide un lote artificial (un torrent que trae varios juegos sueltos con el nombre
 * de todos en el título) en un juego por título. Solo divide cuando cada parte es
 * claramente un juego completo: si alguna parte tiene una sola palabra, empieza
 * por número o es una coletilla («and Me», «48 игр»), el lote se deja entero para
 * no inventar juegos. Los «+» y los «&» no separan: suelen formar parte del título.
 */

const MAX_PARTS = 12
const LOT_MARK_ETC = /(?<!\p{L})(и др|etc)(?!\p{L})|\.\.\./iu
const SEPARATOR = /\s*,\s*|\s+\/\s+/
// «Pack», «Series» y «Vol» no van aquí: en PS Vita son DLC («Costume Pack», «BGM Pack»), no lotes.
export const LOT_MARK = /(?<!\p{L})(collection|dilogy|trilogy|anthology|bundle|megapack|sextet|игр|шт|и др|etc)(?!\p{L})/iu

/** Partes del lote, o null cuando no es un lote dividible con seguridad. */
export function splitLot(title: string): string[] | null {
  const parts = [...new Set(title.split(SEPARATOR).map(p => p.trim()).filter(Boolean))]
  if (parts.length < 2 || parts.length > MAX_PARTS) return null
  // Con una sola coma y sin marca de pack, «Little Kitty, Big City» es un título, no una lista.
  if (!title.includes(' / ') && parts.length < 3 && !LOT_MARK.test(title)) return null
  for (const part of parts) {
    if (part.split(/\s+/).length < 2) return null                 // una sola palabra: puede ser un juego entero
    if (/^\d/.test(part)) return null                             // empieza por número: «2 Classic», «48 игр»
    if (/^(and|or|и|или)\s/i.test(part)) return null              // coletilla: «and Me», «и 2»
    if (!/\p{L}{3,}/u.test(part)) return null
    if (/\d+\s*[-–]\s*\d+/.test(part)) return null                // rango: varios juegos en una parte
    if (/\d+\s*(игр|шт)(?!\p{L})/iu.test(part)) return null              // «20 шт.», «7 игр»
    if (LOT_MARK_ETC.test(part)) return null                      // «и др.», «etc», «…»
    if (part.length > 80) return null
  }
  return parts
}
