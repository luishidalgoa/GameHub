import { createHash } from 'crypto'

/**
 * Resumen del cliente que descarga, guardado en el historial de cada intento.
 *
 * Es funcion pura a proposito: recibe las cabeceras ya leidas y lo que se ha detectado de ellas,
 * para poder probarla sin base de datos. Las cabeceras de sesion (cookie, authorization) no se
 * guardan nunca, ni siquiera en el historial de administracion.
 */

/** Cabeceras que identifican a una persona o a una sesion: nunca se guardan. */
const SECRET_HEADERS = new Set(['cookie', 'authorization', 'proxy-authorization', 'set-cookie'])

/** Ningun valor de cabecera se guarda completo; un User-Agent largo o basura no infla la base. */
const MAX_HEADER_CHARS = 300

export interface DetectedClient {
  client: string
  clientVersion: string | null
  device: string
  browser: string
}

export interface ClientOs {
  os: string
  osVersion: string
  deviceModel: string
}

export interface ClientSummaryInput {
  ip: string
  /** Todas las cabeceras de la petición, en minúsculas. */
  headers: Record<string, string>
  detected: DetectedClient
  os: ClientOs
  /** Qué descarga es: juego, DLC o actualización, y de qué ruta de la API llegó. */
  route: string
  gameId: number
  dlcId: number | null
  dlcType: string | null
  fileName: string
  fileSize: number
  /** Cabecera Range de la primera petición, si la hubo. */
  range: string | null
  /** Identificador que el cliente declara (X-GameHub-Device). Si lo hay, identifica al aparato. */
  deviceId?: string | null
  at: Date
}

export interface ClientSummary {
  clientId: string
  ip: string
  client: string
  clientVersion: string | null
  device: string
  browser: string
  os: string
  osVersion: string
  deviceModel: string
  route: string
  download: {
    gameId: number
    dlcId: number | null
    dlcType: string | null
    fileName: string
    fileSize: number
    range: string | null
  }
  requestedAt: string
  headers: Record<string, string>
}

/**
 * Identificador corto y estable de un cliente: su IP más su User-Agent. Sirve para reconocer que
 * dos descargas salen del mismo dispositivo sin mostrar la cabecera entera. No es un dato de
 * identidad: dos consolas con la misma IP y el mismo User-Agent comparten identificador.
 */
export function clientIdOf(ip: string, userAgent: string): string {
  return createHash('sha256').update(`${ip}\n${userAgent}`).digest('hex').slice(0, 8)
}

/** Copia las cabeceras útiles, sin las secretas y con cada valor acotado. */
export function safeHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [rawName, rawValue] of Object.entries(headers)) {
    const name = rawName.toLowerCase()
    if (SECRET_HEADERS.has(name)) continue
    out[name] = rawValue.slice(0, MAX_HEADER_CHARS)
  }
  return out
}

export function clientSummary(input: ClientSummaryInput): ClientSummary {
  const userAgent = input.headers['user-agent'] ?? ''
  const declared = input.deviceId?.trim()
  return {
    // Dos consolas detrás de la misma IP tienen el mismo User-Agent: su identificador propio las separa.
    clientId: declared ? declared : clientIdOf(input.ip, userAgent),
    ip: input.ip,
    client: input.detected.client,
    clientVersion: input.detected.clientVersion,
    device: input.detected.device,
    browser: input.detected.browser,
    os: input.os.os,
    osVersion: input.os.osVersion,
    deviceModel: input.os.deviceModel,
    route: input.route,
    download: {
      gameId: input.gameId,
      dlcId: input.dlcId,
      dlcType: input.dlcType,
      fileName: input.fileName,
      fileSize: input.fileSize,
      range: input.range,
    },
    requestedAt: input.at.toISOString(),
    headers: safeHeaders(input.headers),
  }
}
