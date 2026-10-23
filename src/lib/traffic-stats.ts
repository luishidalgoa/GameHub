/**
 * Pure helpers behind the traffic screen. No database access here, so the
 * rules (what counts as abandoned, when a rate is undefined, which days have
 * no data) can be tested without a database.
 */

/** A download row still open after this long is counted as abandoned, not in progress. */
export const ABANDON_AFTER_MS = 6 * 60 * 60 * 1000

/**
 * Share of closed download rows that finished. Rows still in progress are not
 * closed yet, so they are left out. Returns null when nothing has closed: a 0 %
 * there would read as failure when it only means "not yet".
 */
export function successPercent(completed: number, abandoned: number): number | null {
  const closed = completed + abandoned
  if (closed === 0) return null
  return Math.round((completed / closed) * 100)
}

/** Share of responses that were 5xx, to one decimal. Null without requests. */
export function errorPercent(total: number, errors: number): number | null {
  if (total === 0) return null
  return Math.round((errors / total) * 1000) / 10
}

/** Local midnight of each of the last `days` days, oldest first, today last. */
export function dayStarts(now: Date, days: number): Date[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (days - 1 - i))
    return d
  })
}

/**
 * Count of timestamps per day in `starts`. A day that begins before `since`
 * (the oldest row still kept) yields null, not zero: those rows may have been
 * deleted by retention, so zero would claim a quiet day that nobody measured.
 */
export function countByDay(dates: Date[], starts: Date[], since: Date | null): Array<number | null> {
  return starts.map((start, i) => {
    const end = i + 1 < starts.length
      ? starts[i + 1]
      : new Date(start.getTime() + 24 * 60 * 60 * 1000)
    if (since === null || start.getTime() < since.getTime()) return null
    return dates.filter((d) => d >= start && d < end).length
  })
}
