/**
 * The states of a download token (#82). The server writes them in
 * download-queue.ts and the queue pages read them, so the list lives here, in a
 * module with no database import, that both sides can use.
 *
 *   waiting     → ready        promoted when a slot frees
 *   ready       → downloading  the full download starts
 *   ready       → expired      its window closes unused
 *   downloading → done         the download finished, or was cut off
 *   downloading → expired      it stalled past the limit
 *   done        → downloading  a retry inside its window (#120)
 *
 * A waiting token is removed by cancelling it, not by a status change.
 */
export const TOKEN_STATUSES = ['waiting', 'ready', 'downloading', 'done', 'expired'] as const
export type TokenStatus = (typeof TOKEN_STATUSES)[number]

const NEXT: Record<TokenStatus, readonly TokenStatus[]> = {
  waiting:     ['ready'],
  ready:       ['downloading', 'expired'],
  downloading: ['done', 'expired'],
  done:        ['downloading'],
  expired:     [],
}

export function canMove(from: TokenStatus, to: TokenStatus): boolean {
  return NEXT[from].includes(to)
}
