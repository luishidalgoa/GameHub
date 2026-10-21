/** Every outbound provider call goes through here, so none can hang a batch. */
export const PROVIDER_TIMEOUT_MS = 20_000
export const PROVIDER_UA = 'GameHub/1.0 (+https://gamehub.hdglabs.com)'

export function providerFetch(url: string | URL, init: RequestInit = {}): Promise<Response> {
  const headers = { 'User-Agent': PROVIDER_UA, ...(init.headers as Record<string, string> | undefined) }
  return fetch(url, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(PROVIDER_TIMEOUT_MS) })
}

export interface HtmlFetchPolicy {
  userAgent: string
  backoffsMs: number[]
  /** `manual` refuses redirects: a redirect is not a confident match. */
  redirect?: RequestRedirect
  /** Throw on a non-2xx answer (LaunchBox); otherwise return '' (Metacritic). */
  failOnStatus: boolean
  /** Throw when every attempt failed (LaunchBox); otherwise return ''. */
  throwOnError: boolean
  label: string
}

/** Fetch an HTML page with backoff: retries 429, 5xx, empty bodies and network errors. */
export async function fetchHtmlWithRetry(url: string, policy: HtmlFetchPolicy, attempt = 0): Promise<string> {
  if (policy.backoffsMs[attempt]) await new Promise(r => setTimeout(r, policy.backoffsMs[attempt]))
  const lastAttempt = attempt >= policy.backoffsMs.length - 1
  const retry = () => fetchHtmlWithRetry(url, policy, attempt + 1)
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 25_000)
    let res: Response
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': policy.userAgent, Accept: 'text/html,application/xhtml+xml' },
        signal: controller.signal,
        ...(policy.redirect && { redirect: policy.redirect }),
      })
    } finally {
      clearTimeout(timer)
    }
    if (res.status === 404) return ''
    if (policy.redirect === 'manual' && res.status >= 300 && res.status < 400) return ''
    if (res.status === 429 || res.status >= 500) {
      if (lastAttempt) return ''
      return retry()
    }
    if (!res.ok) {
      if (policy.failOnStatus) throw new Error(`${policy.label} ${res.status} for ${url}`)
      return ''
    }
    const text = await res.text()
    if (!text && !lastAttempt) return retry()
    return text
  } catch (err) {
    if (!lastAttempt) return retry()
    if (policy.throwOnError) throw err
    return ''
  }
}
