// Per-device "recently viewed" history, stored in localStorage (no DB, no login).
// A simple list of game ids, most-recent first. Recorded when a game's detail is
// opened (modal or /game/[id]).

const KEY = 'gh_recently_viewed'
const MAX = 50

export function getRecentlyViewed(): number[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((n: unknown): n is number => typeof n === 'number') : []
  } catch {
    return []
  }
}

export function addRecentlyViewed(gameId: number): void {
  if (typeof window === 'undefined' || !Number.isFinite(gameId)) return
  try {
    const ids = getRecentlyViewed().filter(id => id !== gameId)
    ids.unshift(gameId)
    localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX)))
  } catch {
    /* ignore quota / serialization errors */
  }
}

export function clearRecentlyViewed(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
