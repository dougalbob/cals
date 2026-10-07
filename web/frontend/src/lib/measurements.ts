import type { BodyOutline, MeasurementLatest, MeasurementPartKey } from '../api/types'

/**
 * The body-map vocabulary (decision 67). The JSON keys are the API's column
 * names; the labels are what the map, the sheets and the history call them.
 */
export interface MeasurementPart {
  key: MeasurementPartKey
  label: string
}

export const MEASUREMENT_PARTS: MeasurementPart[] = [
  { key: 'neck_cm', label: 'Neck' },
  { key: 'chest_cm', label: 'Chest' },
  { key: 'bust_cm', label: 'Bust' },
  { key: 'waist_cm', label: 'Waist' },
  { key: 'upper_arm_cm', label: 'Upper arm' },
  { key: 'hips_cm', label: 'Hips' },
  { key: 'thigh_cm', label: 'Thigh' },
]

/**
 * Decision 98: the female outline carries the Bust point and the male outline
 * the Chest point, so both columns stay meaningful and nobody picks between
 * them. Everything else appears on both.
 */
export function partsForOutline(outline: BodyOutline): MeasurementPart[] {
  const excluded: MeasurementPartKey = outline === 'female' ? 'chest_cm' : 'bust_cm'
  return MEASUREMENT_PARTS.filter((part) => part.key !== excluded)
}

export function labelFor(partKey: MeasurementPartKey): string {
  return MEASUREMENT_PARTS.find((part) => part.key === partKey)?.label ?? partKey
}

/** Round to one decimal the way the stepper and the display want it. */
export function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/** Whole days from `fromIso` to `toIso` (both YYYY-MM-DD, UTC-safe). */
export function daysBetweenIso(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`)
  const to = Date.parse(`${toIso}T00:00:00Z`)
  if (Number.isNaN(from) || Number.isNaN(to)) return 0
  return Math.round((to - from) / (24 * 60 * 60 * 1000))
}

/**
 * The newest date any part was recorded, or null for someone who has never
 * measured. Drives the staleness line and decision 87's amber cue.
 */
export function latestMeasurementDate(latest: MeasurementLatest): string | null {
  let newest: string | null = null
  for (const point of Object.values(latest)) {
    if (point && (newest === null || point.date > newest)) newest = point.date
  }
  return newest
}

/**
 * Decision 122's cadence: a measurement session at least every 14 days. This
 * revises decision 87's 3–4 week ideal and is the same window the reminders
 * bell judges against, so the Metrics staleness cue and the nag agree.
 */
export const MEASUREMENT_OVERDUE_DAYS = 14
