/**
 * Parsea un nombre de archivo con convención No-Intro / Redump y devuelve el título limpio.
 * Formato: "Game Title (Region) (v1.2) [Extra].ext"
 */
export function parseNoIntroFilename(filename: string): { title: string } {
  // Quita la extensión
  const noExt = filename.replace(/\.[^.]+$/, '')
  // Quita todas las etiquetas (Region), (v1.2), [Tag], etc.
  const clean = noExt
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*\[[^\]]*\]/g, '')
    .trim()
  return { title: clean || noExt.trim() }
}
