/**
 * Pure domain helpers — the parts worth unit-testing.
 *
 * These mirror behaviour that currently lives in web/static/js/utils/dates.js,
 * utils/format.js and components/metrics.js. If the spike graduates, this
 * module (plus bank maths) is the first thing to cover with tests, because
 * these are the numbers the user trusts.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Parse a `YYYY-MM-DD` string at UTC noon so the calendar date never shifts. */
function parseIsoDate(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`)
}

export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(iso: string, delta: number): string {
  const date = new Date(parseIsoDate(iso).getTime() + delta * MS_PER_DAY)
  return date.toISOString().slice(0, 10)
}

export function formatLongDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(parseIsoDate(iso))
}

export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(parseIsoDate(iso))
}

export function relativeDayLabel(iso: string, today: string): string {
  if (iso === today) return 'Today'
  if (iso === addDays(today, -1)) return 'Yesterday'
  if (iso === addDays(today, 1)) return 'Tomorrow'
  return formatLongDate(iso)
}

export interface StonesPounds {
  stones: number
  pounds: number
}

const LBS_PER_KG = 2.2046226218

/** Convert kg to stones + pounds, carrying 13.9 lb up to the next stone. */
export function kgToStonesPounds(kg: number): StonesPounds {
  const totalPounds = kg * LBS_PER_KG
  let stones = Math.floor(totalPounds / 14)
  let pounds = Math.round((totalPounds - stones * 14) * 10) / 10
  if (pounds >= 14) {
    stones += 1
    pounds -= 14
  }
  return { stones, pounds }
}

export function formatStonesPounds(kg: number): string {
  const { stones, pounds } = kgToStonesPounds(kg)
  return `${stones} st ${pounds.toFixed(1)} lb`
}

export function formatKg(kg: number): string {
  return `${kg.toFixed(1)} kg`
}

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

export function formatGrams(value: number): string {
  return `${formatNumber(value, value < 10 ? 1 : 0)} g`
}

/** "% of a target", clamped for progress bars. */
export function percentOf(value: number, target: number): number {
  if (!target) return 0
  return Math.max(0, Math.min(100, (value / target) * 100))
}
