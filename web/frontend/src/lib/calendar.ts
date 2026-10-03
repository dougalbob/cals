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

export function hydrationRatio(ml: number, target: number): number {
  if (target <= 0) return 0
  return Math.max(0, Math.min(1, ml / target))
}
