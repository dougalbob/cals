import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  calorieBarSplit,
  calorieRatio,
  clampMonthToToday,
  clampWeekAnchorToToday,
  isFutureDay,
  formatMonthLabel,
  formatWeekRangeLabel,
  hydrationRatio,
  monthForIso,
  monthGridRange,
  weekRange,
} from './calendar'

describe('weekRange', () => {
  it('anchors Monday–Sunday for any day of the week', () => {
    // Wednesday 7 Oct 2026 → Monday 5 Oct through Sunday 11 Oct.
    expect(weekRange('2026-10-07')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
    // Monday stays Monday–Sunday.
    expect(weekRange('2026-10-05')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
    // Sunday is the last day of that week, not the first of the next.
    expect(weekRange('2026-10-11')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
  })

  it('wraps months and year boundaries correctly', () => {
    // Thu 1 Oct 2026 — week starts Mon 28 Sep.
    expect(weekRange('2026-10-01')).toEqual({ from: '2026-09-28', to: '2026-10-04' })
    // Sun 3 Jan 2027.
    expect(weekRange('2027-01-03').from).toBe('2026-12-28')
  })
})

describe('monthGridRange', () => {
  it('pads to 42 days from the Monday on or before 1st', () => {
    // October 2026: 1st is a Thursday → Monday 28 September through Sunday 8 November.
    const { from, to } = monthGridRange('2026-10')
    expect(from).toBe('2026-09-28')
    expect(to).toBe('2026-11-08')
  })

  it('addMonths walks the calendar without drifting by day', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-01')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01')
    expect(addMonths('2026-10-05', -1)).toBe('2026-09-01')
  })
})

describe('labels', () => {
  it('formats month label in long UK English', () => {
    expect(formatMonthLabel('2026-10')).toBe('October 2026')
  })

  it('omits the month for the start when the week is inside one month', () => {
    expect(formatWeekRangeLabel('2026-10-05', '2026-10-11')).toMatch(/5 – 11 Oct/)
  })

  it('monthForIso extracts YYYY-MM from any ISO date', () => {
    expect(monthForIso('2026-10-07')).toBe('2026-10')
  })
})

describe('addDays', () => {
  it('adds and subtracts calendar days, including across DST-ish boundaries (UTC safe)', () => {
    expect(addDays('2026-10-07', 1)).toBe('2026-10-08')
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('ratios', () => {
  it('clamps calorieRatio to [-1, 2] so blowouts do not dominate the scale', () => {
    expect(calorieRatio(0, 2000)).toBe(0)
    expect(calorieRatio(1000, 2000)).toBe(0.5)
    expect(calorieRatio(2000, 2000)).toBe(1)
    expect(calorieRatio(5000, 2000)).toBe(2) // 250% is the cap
    expect(calorieRatio(-2000, 2000)).toBe(-1) // large deficit clamps to −1
  })

  it('hydrationRatio is 0..1', () => {
    expect(hydrationRatio(0, 2000)).toBe(0)
    expect(hydrationRatio(1000, 2000)).toBe(0.5)
    expect(hydrationRatio(2500, 2000)).toBe(1)
  })
})

describe('calorieBarSplit', () => {
  it('fills a green bar towards the goal while the day is under it', () => {
    expect(calorieBarSplit(0, 1000)).toEqual({ greenPct: 0, redPct: 0 })
    expect(calorieBarSplit(250, 1000)).toEqual({ greenPct: 25, redPct: 0 })
    expect(calorieBarSplit(1000, 1000)).toEqual({ greenPct: 100, redPct: 0 })
  })

  it('splits an over-goal day at the goal instead of painting the whole bar red', () => {
    // The owner's example: 1,200 against a 1,000 goal is a 20% overspend, so
    // the red tail is the fifth of the bar past the goal, not the lot.
    expect(calorieBarSplit(1200, 1000)).toEqual({ greenPct: 83.3, redPct: 16.7 })
    // Half again as much as the budget: the red tail grows, the green shrinks.
    expect(calorieBarSplit(1500, 1000)).toEqual({ greenPct: 66.7, redPct: 33.3 })
    // The worst overspend in nine months of data (~30%) is still a minority of
    // the bar, which is why this presentation is safe to adopt.
    expect(calorieBarSplit(1300, 1000)).toEqual({ greenPct: 76.9, redPct: 23.1 })
  })

  it('stays inside the track for absurd totals and missing goals', () => {
    const extreme = calorieBarSplit(100000, 1000)
    expect(extreme.redPct).toBeCloseTo(99, 0)
    expect(extreme.greenPct + extreme.redPct).toBeCloseTo(100, 1)
    // A user with no goal set gets an empty track rather than a division by zero.
    expect(calorieBarSplit(1200, 0)).toEqual({ greenPct: 0, redPct: 0 })
    expect(calorieBarSplit(Number.NaN, 1000)).toEqual({ greenPct: 0, redPct: 0 })
  })
})

describe('looking forward past today', () => {
  const today = '2026-10-07'

  it('clamps a future month key to the month containing today', () => {
    expect(clampMonthToToday('2026-10', today)).toBe('2026-10')
    expect(clampMonthToToday('2026-09', today)).toBe('2026-09')
    expect(clampMonthToToday('2026-11', today)).toBe('2026-10')
    expect(clampMonthToToday('2027-01', today)).toBe('2026-10')
  })

  it('clamps a future week anchor onto today, keeping its week', () => {
    expect(clampWeekAnchorToToday('2026-10-05', today)).toBe('2026-10-05')
    // A future day inside today's own week (Mon 5th – Sun 11th) lands on today,
    // which is the same week: the grid still shows the days that have happened.
    expect(clampWeekAnchorToToday('2026-10-09', today)).toBe(today)
    expect(clampWeekAnchorToToday('2026-10-12', today)).toBe(today)
    expect(clampWeekAnchorToToday('2026-12-25', today)).toBe(today)
    // A clamped future anchor still resolves to today's own week.
    expect(weekRange(clampWeekAnchorToToday('2026-10-12', today))).toEqual({
      from: '2026-10-05',
      to: '2026-10-11',
    })
  })

  it('marks only days strictly after today as future', () => {
    expect(isFutureDay('2026-10-06', today)).toBe(false)
    expect(isFutureDay('2026-10-07', today)).toBe(false)
    expect(isFutureDay('2026-10-08', today)).toBe(true)
    expect(isFutureDay('2026-11-01', today)).toBe(true)
  })
})
