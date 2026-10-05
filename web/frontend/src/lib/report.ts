/**
 * Weekly report maths (Phase 14.6, decision 46 / decisions 107–109).
 *
 * The report is presentation over data the other slices already produce, so
 * everything here is a pure function over the canonical payloads — the
 * Calendar's per-day rows, the weigh-in series and the nutrition analysis — and
 * nothing re-derives the bank: a day's closing balance comes from the Calendar,
 * which calls the same `computeBankWindow` helper as `GET /api/bank`.
 *
 * Decision 42's rule runs through the whole card: a day with no logging is
 * excluded from budgets and averages, and is listed by name so the exclusion is
 * never quietly unexplained. Decisions 107–109 settle the picker's shape (a
 * week at a time, with a free date range available), the week it opens on (the
 * current one) and what "best" and "worst" day mean (closest to / furthest
 * from the daily goal).
 */

import type { CalendarDay, WeightEntry } from '../api/types'
import { addDays, clampWeekAnchorToToday, weekRange } from './calendar'

/** The API's own bound on an explicit range, mirrored so the UI cannot ask for more. */
export const REPORT_MAX_SPAN_DAYS = 400

export type ReportMode = 'week' | 'custom'

export interface ReportRange {
  mode: ReportMode
  /** First day shown, inclusive, `YYYY-MM-DD`. */
  from: string
  /** Last day shown, inclusive, never after today. */
  to: string
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isIsoDate(value: string | null): value is string {
  return value !== null && ISO_DATE.test(value)
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)
}

/** The current week so far: Monday through today (decision 108). */
export function currentWeekRange(today: string): ReportRange {
  const week = weekRange(today)
  return { mode: 'week', from: week.from, to: week.to > today ? today : week.to }
}

/**
 * Read the report's window out of the URL, defaulting to the current week.
 *
 * The report owns its own search-parameter names (`report`, `report_anchor`,
 * `report_from`, `report_to`) because `from`/`to` already drive the pannable
 * charts on the same route (decision 69). A hand-edited URL cannot push the
 * card into the future or past the API's 400-day bound; nonsense falls back to
 * the current week rather than erroring.
 */
export function readReportRange(searchParams: URLSearchParams, today: string): ReportRange {
  if (searchParams.get('report') === 'custom') {
    const from = searchParams.get('report_from')
    const to = searchParams.get('report_to')
    if (isIsoDate(from) && isIsoDate(to)) {
      const end = to > today ? today : to
      if (from > end) return currentWeekRange(today)
      let start = from
      if (daysBetween(start, end) + 1 > REPORT_MAX_SPAN_DAYS) {
        start = addDays(end, -(REPORT_MAX_SPAN_DAYS - 1))
      }
      return { mode: 'custom', from: start, to: end }
    }
    return currentWeekRange(today)
  }

  const anchor = searchParams.get('report_anchor')
  if (searchParams.get('report') === 'week' && isIsoDate(anchor)) {
    const week = weekRange(clampWeekAnchorToToday(anchor, today))
    return { mode: 'week', from: week.from, to: week.to > today ? today : week.to }
  }

  return currentWeekRange(today)
}

/**
 * The URL parameters for a range, or null when it is the default current week
 * (so the clean `/metrics` URL stays clean). The caller merges/clears the
 * report's four parameters rather than replacing the whole query string, which
 * would drop the charts' `from`/`to` window.
 */
export type ReportParams =
  | { report: 'week'; report_anchor: string }
  | { report: 'custom'; report_from: string; report_to: string }

export function reportParams(range: ReportRange, today: string): ReportParams | null {
  const current = currentWeekRange(today)
  if (range.mode === 'week' && range.from === current.from && range.to === current.to) return null
  if (range.mode === 'custom') {
    return { report: 'custom', report_from: range.from, report_to: range.to }
  }
  return { report: 'week', report_anchor: range.from }
}

export const REPORT_PARAM_NAMES = ['report', 'report_anchor', 'report_from', 'report_to'] as const

export interface ReportDay {
  date: string
  day: CalendarDay
  /** Signed calories against the daily goal: positive is over. */
  delta: number
}

export interface ReportBankMovement {
  opening: number
  closing: number
  movement: number
}

export interface ReportWeightChange {
  startKg: number
  endKg: number
  changeKg: number
  startDate: string
  endDate: string
}

export interface ReportHydration {
  totalMl: number
  targetMl: number
  daysMetTarget: number
  daysWithWater: number
}

export interface WeeklyReportSummary {
  rangeDays: number
  loggedDays: CalendarDay[]
  /** Days with no logging at all — listed so decision 42's exclusions are explained. */
  excludedDays: CalendarDay[]
  totalCalories: number
  /** Average over the logged days only, as the Nutrition screen does. */
  averageCalories: number
  /** The daily goal (the same figure for every day in the range). */
  goalPerDay: number
  /** Daily goal × logged days — the budget the bank's rule would count. */
  loggedDaysBudget: number
  /** Consumed − budget: positive means the period ran over. */
  surplus: number
  daysOver: number
  daysUnder: number
  daysOnGoal: number
  /** Logged day closest to the goal, and the day furthest from it (decision 109). */
  bestDay: ReportDay | null
  worstDay: ReportDay | null
  bank: ReportBankMovement | null
  hydration: ReportHydration
  weight: ReportWeightChange | null
}

function toReportDay(day: CalendarDay, goal: number): ReportDay {
  return { date: day.date, day, delta: day.calories - goal }
}

/**
 * Weigh-in change across a period.
 *
 * Follows the trend line's carry-forward rule: the readings are the latest
 * weigh-in at or before each end of the period, because nobody weighs in every
 * day. If the period's first weigh-in is the only one, there is no change to
 * report yet — null, never a fabricated zero.
 */
export function weightChangeOverRange(
  entries: WeightEntry[],
  from: string,
  to: string,
): ReportWeightChange | null {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  const end = [...sorted].reverse().find((entry) => entry.date <= to)
  if (!end || end.date < from) return null

  const before = [...sorted].reverse().find((entry) => entry.date < from)
  const start = before ?? sorted.find((entry) => entry.date >= from && entry.date <= to)
  if (!start || start.date >= end.date) return null

  return {
    startKg: start.weight_kg,
    endKg: end.weight_kg,
    changeKg: end.weight_kg - start.weight_kg,
    startDate: start.date,
    endDate: end.date,
  }
}

/**
 * Summarise a report range.
 *
 * `calendarDays` is the Calendar response over `[from − 1, to]`: the extra
 * leading day is the previous day's closing balance, which is what the period's
 * bank movement is measured from (a day's closing balance is the bank as of the
 * next morning, so the day-before-the-range sits immediately before the first
 * day's opening position).
 */
export function summariseReport({
  days,
  from,
  to,
  weights,
}: {
  days: CalendarDay[]
  from: string
  to: string
  weights: WeightEntry[]
}): WeeklyReportSummary {
  const byDate = new Map(days.map((day) => [day.date, day]))
  const inRange = days
    .filter((day) => day.date >= from && day.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date))

  const goalPerDay = inRange[0]?.goal ?? 0
  const loggedDays = inRange.filter((day) => day.has_data)
  const excludedDays = inRange.filter((day) => !day.has_data)

  const totalCalories = loggedDays.reduce((acc, day) => acc + day.calories, 0)
  const loggedDaysBudget = goalPerDay * loggedDays.length
  const surplus = totalCalories - loggedDaysBudget

  let daysOver = 0
  let daysUnder = 0
  let daysOnGoal = 0
  for (const day of loggedDays) {
    if (day.calories > goalPerDay) daysOver += 1
    else if (day.calories < goalPerDay) daysUnder += 1
    else daysOnGoal += 1
  }

  // Decision 109: the best day is the one closest to goal, the worst the one
  // furthest away — either side. Ties keep the earliest day.
  let bestDay: ReportDay | null = null
  let worstDay: ReportDay | null = null
  let bestGap = Infinity
  let worstGap = -Infinity
  for (const day of loggedDays) {
    const candidate = toReportDay(day, goalPerDay)
    const gap = Math.abs(candidate.delta)
    if (gap < bestGap) {
      bestGap = gap
      bestDay = candidate
    }
    if (gap > worstGap) {
      worstGap = gap
      worstDay = candidate
    }
  }

  const openingDay = byDate.get(addDays(from, -1))
  const closingDay = byDate.get(to)
  const bank =
    openingDay && closingDay
      ? {
          opening: openingDay.bank_balance,
          closing: closingDay.bank_balance,
          movement: closingDay.bank_balance - openingDay.bank_balance,
        }
      : null

  const targetMl = inRange[0]?.hydration_target_ml ?? 0
  const hydration: ReportHydration = {
    totalMl: inRange.reduce((acc, day) => acc + day.hydration_ml, 0),
    targetMl,
    daysMetTarget: loggedDays.filter((day) => targetMl > 0 && day.hydration_ml >= targetMl).length,
    daysWithWater: inRange.filter((day) => day.hydration_ml > 0).length,
  }

  return {
    rangeDays: inRange.length,
    loggedDays,
    excludedDays,
    totalCalories,
    averageCalories: loggedDays.length ? totalCalories / loggedDays.length : 0,
    goalPerDay,
    loggedDaysBudget,
    surplus,
    daysOver,
    daysUnder,
    daysOnGoal,
    bestDay,
    worstDay,
    bank,
    hydration,
    weight: weightChangeOverRange(weights, from, to),
  }
}
