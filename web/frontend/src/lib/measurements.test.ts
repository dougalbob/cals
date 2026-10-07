import { describe, expect, it } from 'vitest'
import type { MeasurementLatest } from '../api/types'
import {
  MEASUREMENT_OVERDUE_DAYS,
  daysBetweenIso,
  labelFor,
  latestMeasurementDate,
  partsForOutline,
  round1,
} from './measurements'

describe('partsForOutline', () => {
  it('gives the female outline Bust and never Chest (decision 98)', () => {
    const keys = partsForOutline('female').map((part) => part.key)
    expect(keys).toContain('bust_cm')
    expect(keys).not.toContain('chest_cm')
  })

  it('gives the male outline Chest and never Bust (decision 98)', () => {
    const keys = partsForOutline('male').map((part) => part.key)
    expect(keys).toContain('chest_cm')
    expect(keys).not.toContain('bust_cm')
  })

  it('shows the other five parts on both outlines', () => {
    for (const outline of ['female', 'male'] as const) {
      const keys = partsForOutline(outline).map((part) => part.key)
      for (const shared of ['neck_cm', 'waist_cm', 'upper_arm_cm', 'hips_cm', 'thigh_cm']) {
        expect(keys).toContain(shared)
      }
      expect(keys).toHaveLength(6)
    }
  })
})

describe('labelFor', () => {
  it('returns the human name for every part key', () => {
    expect(labelFor('upper_arm_cm')).toBe('Upper arm')
    expect(labelFor('waist_cm')).toBe('Waist')
  })
})

describe('round1', () => {
  it('keeps one decimal and shrinks float noise', () => {
    expect(round1(98.19999999)).toBe(98.2)
    expect(round1(98.25)).toBe(98.3)
    expect(round1(0.1 + 0.2)).toBe(0.3)
  })
})

describe('daysBetweenIso', () => {
  it('counts whole days between two dates', () => {
    expect(daysBetweenIso('2026-09-01', '2026-09-29')).toBe(28)
    expect(daysBetweenIso('2026-10-05', '2026-10-05')).toBe(0)
  })

  it('is zero rather than NaN on bad input', () => {
    expect(daysBetweenIso('not-a-date', '2026-10-05')).toBe(0)
  })
})

describe('latestMeasurementDate', () => {
  const point = (date: string) => ({ value: 1, date, previous: null })

  it('finds the newest date across parts', () => {
    const latest = {
      neck_cm: null,
      chest_cm: point('2026-08-01'),
      bust_cm: null,
      waist_cm: point('2026-09-14'),
      upper_arm_cm: null,
      hips_cm: point('2026-09-02'),
      thigh_cm: null,
    } satisfies MeasurementLatest
    expect(latestMeasurementDate(latest)).toBe('2026-09-14')
  })

  it('is null for someone who has never measured', () => {
    const latest = {
      neck_cm: null,
      chest_cm: null,
      bust_cm: null,
      waist_cm: null,
      upper_arm_cm: null,
      hips_cm: null,
      thigh_cm: null,
    } satisfies MeasurementLatest
    expect(latestMeasurementDate(latest)).toBeNull()
  })
})

describe('decision 122 cadence', () => {
  it('treats 14 days as the measurement window, matching the reminders bell', () => {
    expect(MEASUREMENT_OVERDUE_DAYS).toBe(14)
  })
})
