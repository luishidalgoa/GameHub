const EDITION = /\s+(?:(?:complete|definitive|ultimate|deluxe|premium|special|gold|anniversary|legendary|standard|game of the year|goty)\s+)*(?:edition|edici[oó]n|double pack)\s*$/i

/**
 * Título de un juego de Switch tal como lo publica una fuente de torrents, listo para buscarlo
 * en los proveedores de metadatos: sin etiquetas de fichero, sin anotaciones entre paréntesis
 * (traducciones, «порт», «хоумбрю»…), sin DLC ni añadidos tras «+», con el primer título cuando
 * es un paquete («A / B») y sin la palabra de edición al final.
 */
export function cleanSwitchTitle(raw: string): string {
  let t = raw.replace(/\[[^\]]*\]/g, ' ')
  t = t.replace(/([\p{L}\p{N}]+)\s*\((\d+)\)/gu, (_m, word: string, n: string) => (/^[IVXLC\-]+$/i.test(word) ? word : n))
  for (let i = 0; i < 3; i++) t = t.replace(/\([^()]*\)/g, ' ')
  t = t.replace(/\s\+\s.*$/, ' ')
  t = t.split(/\s+\/\s*/)[0]
  t = t.replace(/\s+/g, ' ').trim()
  t = t.replace(EDITION, '').replace(/[\s:,\-–]+$/, '').trim()
  return t || raw.trim()
}
