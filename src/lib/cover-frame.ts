/**
 * Encuadre con el que se recortó la portada, en fracciones del marco de la
 * plataforma: `x` e `y` son la esquina superior izquierda y `s` el tamaño. Como
 * el marco tiene la proporción de la plataforma, el encuadre vale para cualquier
 * resolución de la imagen original.
 */
export interface CoverFrame {
  x: number
  y: number
  s: number
}

const MIN_S = 0.1
const EPS = 1e-6

/** Un encuadre válido, o null (texto JSON o valor ya leído). */
export function parseCoverFrame(value: unknown): CoverFrame | null {
  let raw = value
  if (typeof value === 'string') {
    try { raw = JSON.parse(value) } catch { return null }
  }
  if (!raw || typeof raw !== 'object') return null
  const { x, y, s } = raw as Record<string, unknown>
  if (![x, y, s].every(n => typeof n === 'number' && Number.isFinite(n))) return null
  const frame = { x: x as number, y: y as number, s: s as number }
  if (frame.s < MIN_S - EPS || frame.s > 1 + EPS) return null
  if (frame.x < -EPS || frame.y < -EPS) return null
  if (frame.x + frame.s > 1 + EPS || frame.y + frame.s > 1 + EPS) return null
  return frame
}

export function serializeCoverFrame(frame: CoverFrame | null): string | null {
  return frame ? JSON.stringify(frame) : null
}
