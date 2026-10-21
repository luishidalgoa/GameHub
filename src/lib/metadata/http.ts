/** Every outbound provider call goes through here, so none can hang a batch. */
export const PROVIDER_TIMEOUT_MS = 20_000
export const PROVIDER_UA = 'GameHub/1.0 (+https://gamehub.hdglabs.com)'

export function providerFetch(url: string | URL, init: RequestInit = {}): Promise<Response> {
  const headers = { 'User-Agent': PROVIDER_UA, ...(init.headers as Record<string, string> | undefined) }
  return fetch(url, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(PROVIDER_TIMEOUT_MS) })
}
