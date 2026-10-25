const TIMEOUT_MS = 20_000

/** Descarga de texto de una fuente de compatibilidad; un error o un tiempo agotado lanza. */
export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`)
  return res.text()
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`)
  return res.json() as Promise<T>
}
