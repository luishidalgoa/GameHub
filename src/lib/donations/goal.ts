/**
 * Quarterly donation goal, free of the database so the rules can be tested alone.
 *
 * Quarters are calendar quarters in UTC. Only EUR donations count: the goal is
 * in euros, and converting other currencies would need a rate we do not keep.
 */

export interface Quarter {
  start: Date
  end: Date
  label: string
}

/** The calendar quarter (UTC) that contains `now`. `end` is exclusive. */
export function quarterOf(now: Date): Quarter {
  const q = Math.floor(now.getUTCMonth() / 3)
  const year = now.getUTCFullYear()
  return {
    start: new Date(Date.UTC(year, q * 3, 1)),
    end: new Date(Date.UTC(year, q * 3 + 3, 1)),
    label: `T${q + 1} ${year}`,
  }
}

/** The goal from its stored text. Null when unset, zero, negative or not a number. */
export function parseGoal(raw: string | null | undefined): number | null {
  if (!raw) return null
  const n = Number.parseFloat(raw.trim().replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

export interface GoalProgress {
  goal: number
  raised: number
  /** Whole percent of the goal. Can pass 100. */
  percent: number
  /** Fill of the first layer, 0–100. */
  firstLayer: number
  /**
   * Fill of the second layer, 0–100. It only has something to show once the goal
   * is passed, and it covers the first layer from the left in another colour.
   * It stops at 200 %: beyond that the second layer is simply full.
   */
  secondLayer: number
}

const clamp = (v: number) => Math.min(100, Math.max(0, v))

export function goalProgress(raised: number, goal: number): GoalProgress {
  const percent = Math.floor((raised / goal) * 100)
  return {
    goal,
    raised,
    percent,
    firstLayer: clamp(percent),
    secondLayer: clamp(percent - 100),
  }
}
