export const CONSENT_KEY = 'gh_consent_v1'
export type ConsentValue = 'all' | 'necessary'

export function getConsent(): ConsentValue | null {
  if (typeof window === 'undefined') return null
  const v = localStorage.getItem(CONSENT_KEY)
  if (v === 'all' || v === 'necessary') return v
  return null
}

export function setConsent(value: ConsentValue) {
  localStorage.setItem(CONSENT_KEY, value)
}
