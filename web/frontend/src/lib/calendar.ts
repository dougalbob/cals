/**
 * Date helpers for the calendar (decision 49).
 *
 * Weeks run Monday–Sunday to match UK convention (owner is in Birmingham, GB).
 * Months are padded to full weeks so the grid is 6 rows × 7 columns without
 * ragged edges, which is the familiar wall-calendar layout.
 */

const DAY_MS = 24 * 60 * 60 * 1000

export type CalendarView = 'month' | 'week'

export function parseIso(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`)
}

export function toIso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function todayIso(): string {
  return toIso(new Date())
}

export function addDays(iso: string, n: number): string {
  return toIso(new Date(parseIso(iso).getTime() + n * DAY_MS))
}

export function addMonths(iso: string, n: number): string {
  const d = parseIso(iso)
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
  return toIso(next)
}

function startOfWeek(iso: string): string {
  const d = parseIso(iso)
  // getUTCDay: Sun=0 … Sat=6. Shift so Monday=0 … Sunday=6.
  const dow = (d.getUTCDay() + 6) % 7
  return addDays(iso, -dow)
}

export function weekRange(iso: string): { from: string; to: string } {
  const from = startOfWeek(iso)
  const to = addDays(from, 6)
  return { from, to }
}

/**
 * Return the Monday–Sunday range that fully contains the given month. Always
 * 42 days (6 weeks), even when the month fits in fewer, so the grid is stable
 * and position of day numbers is predictable between months.
 */
export function monthGridRange(yyyymm: string): { from: string; to: string } {
  // yyyymm is "YYYY-MM"
  const [y, m] = yyyymm.split('-').map(Number)
  const first = toIso(new Date(Date.UTC(y, m - 1, 1)))
  const from = startOfWeek(first)
  // Pad to a full 6 rows = 42 days from `from`.
  const to = addDays(from, 41)
  return { from, to }
}

export function monthForIso(iso: string): string {
  return iso.slice(0, 7)
}

export function formatMonthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatDayShort(iso: string): string {
  return parseIso(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    timeZone: 'UTC',
  })
}

export function formatDayNumber(iso: string): number {
  return parseIso(iso).getUTCDate()
}

export function formatWeekRangeLabel(from: string, to: string): string {
  const a = parseIso(from)
  const b = parseIso(to)
  const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()
  const startFmt = a.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: sameMonth ? undefined : 'short',
    timeZone: 'UTC',
  })
  const endFmt = b.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: a.getUTCFullYear() === b.getUTCFullYear() ? undefined : 'numeric',
    timeZone: 'UTC',
  })
  return `${startFmt} – ${endFmt}`
}

/** English week header, Monday first. */
export const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/**
 * How far a daily total over/undershoots goal, as a ratio in [-1, 2] used for
 * the day-cell colour cue. Clamped so a 4,000 kcal blowout doesn't wash out
 * the whole grid.
 */
export function calorieRatio(calories: number, goal: number): number {
  if (goal <= 0) return 0
  const ratio = calories / goal
  return Math.max(-1, Math.min(2, ratio))
}

export interface CalorieBarSplit {
  /** Green share of the bar, as a percentage of the track width (0–100). */
  greenPct: number
  /** Red share of the bar, as a percentage of the track width (0–100). */
  redPct: number
}

/** One decimal place: enough to make 17.3% vs 17.4% honest, not enough to jitter. */
function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Geometry for a day's calorie bar (owner request, 2026-10-03).
 *
 * A day over goal used to paint the whole bar red, which said "over" but hid
 * everything else: every overspent day looked identical, and the amount eaten
 * before the goal was reached was invisible. Instead the bar now splits at the
 * moment the goal was reached:
 *
 * - **Under or at goal** — a green progress bar filling `calories / goal` of
 *   the track, exactly as before.
 * - **Over goal** — the track is full, split into the part covered by the goal
 *   (green) and the overspend (red). A 1,200 kcal day against a 1,000 goal is
 *   83.3% green and a 16.7% red tail, so the red segment *is* the overspend.
 *
 * The split is always weighted against the day's own total, which keeps the red
 * share under a quarter of the bar for any realistic overshoot — the owner's
 * nine months of data top out at about 30% over goal (30/130 ≈ 23%).
 */
export function calorieBarSplit(calories: number, goal: number): CalorieBarSplit {
  if (!(goal > 0) || !(calories > 0)) return { greenPct: 0, redPct: 0 }
  if (calories <= goal) {
    return { greenPct: round1((calories / goal) * 100), redPct: 0 }
  }
  const redPct = round1(((calories - goal) / calories) * 100)
  return { greenPct: round1(100 - redPct), redPct }
}

/**
 * Clamp a month key (`YYYY-MM`) so the calendar can never be pushed into a
 * future month: today's month is the furthest forward it will go.
 */
export function clampMonthToToday(yyyymm: string, today: string): string {
  const current = monthForIso(today)
  return yyyymm > current ? current : yyyymm
}

/**
 * Clamp a week anchor so the calendar never shows a week that has not started
 * yet. Any date past today falls back to today, which lands on today's week.
 */
export function clampWeekAnchorToToday(anchor: string, today: string): string {
  return anchor > today ? today : anchor
}

/** Whether a grid date is still in the future, so it must not be tappable. */
export function isFutureDay(iso: string, today: string): boolean {
  return iso > today
}

export function hydrationRatio(ml: number, target: number): number {
  if (target <= 0) return 0
  return Math.max(0, Math.min(1, ml / target))
}
