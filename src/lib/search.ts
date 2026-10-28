/** The longest search the page takes: a title is never longer than this. */
export const SEARCH_MAX_LENGTH = 100

/** A search as the user typed it: trimmed, and cut to a title's length. Empty when there is none. */
export function searchTerm(raw: string | null | undefined): string {
  return (raw ?? '').trim().slice(0, SEARCH_MAX_LENGTH)
}
