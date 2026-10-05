/**
 * Fixture-API tests for the metrics series endpoints.
 *
 * The fixture mirrors internal/handlers/stats.go, weight.go and the Go
 * regression tests in internal/handlers/stats_test.go. Slice 14.1 gave these
 * endpoints an explicit from/to window (decision 69's panning needs a range,
 * not just "the last N days") and made /api/stats/calories count drink
 * calories. If the two implementations drift, the preview lies to whoever is
 * reviewing a chart in it, so the same contract is pinned on both sides.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { handle } from './handler.mjs'
import * as seed from './seed.mjs'

const get = (target) => handle('GET', new URL(`http://localhost${target}`), null)

const isoDate = /^\d{4}-\d{2}-\d{2}$/

beforeEach(() => {
  seed.resetFixtures()
})

describe('fixture metrics series endpoints', () => {
  it('returns one row per day, dated plainly, ending today', () => {
    const { status, body } = get('/api/stats/calories?days=7')

    expect(status).toBe(200)
    expect(body).toHaveLength(7)
    for (const day of body) {
      expect(day.date).toMatch(isoDate)
    }
    expect(body.at(-1).date).toBe(seed.TODAY)
  })

  it('counts drink calories as well as food, so the chart cannot disagree with the ring', () => {
    const { body } = get('/api/stats/calories?days=14')

    const withDrinks = body.filter((day) => seed.drinkEntriesFor(day.date).length > 0)
    expect(withDrinks.length, 'the fixture seeds drink entries').toBeGreaterThan(0)

    for (const day of withDrinks) {
      const foodOnly = seed.totalsFor(day.date).calories
      expect(day.calories, `${day.date} must include its drink calories`).toBeGreaterThan(foodOnly)
    }
  })

  it('honours an explicit from/to window', () => {
    const from = seed.dateOffset(5)
    const to = seed.dateOffset(2)

    const calories = get(`/api/stats/calories?from=${from}&to=${to}`)
    expect(calories.status).toBe(200)
    expect(calories.body.map((d) => d.date)).toEqual([
      seed.dateOffset(5),
      seed.dateOffset(4),
      seed.dateOffset(3),
      seed.dateOffset(2),
    ])

    const bank = get(`/api/stats/bank?from=${from}&to=${to}`)
    expect(bank.status).toBe(200)
    expect(bank.body).toHaveLength(4)
    expect(bank.body[0].date).toBe(from)
    expect(bank.body.at(-1).date).toBe(to)
  })

  it('filters weight entries by the same window', () => {
    const all = get('/api/weight?days=90').body
    expect(all.length).toBeGreaterThan(0)

    const from = seed.dateOffset(3)
    const to = seed.dateOffset(1)
    const windowed = get(`/api/weight?from=${from}&to=${to}`)

    expect(windowed.status).toBe(200)
    for (const entry of windowed.body) {
      expect(entry.date >= from && entry.date <= to).toBe(true)
      expect(entry.date).toMatch(isoDate)
    }
    expect(windowed.body.length).toBeLessThan(all.length)
  })

  it('clamps a future `to` back to today rather than fabricating empty days', () => {
    const future = seed.nextDate(seed.nextDate(seed.TODAY))
    const { body } = get(`/api/stats/calories?from=${seed.dateOffset(1)}&to=${future}`)

    expect(body).toHaveLength(2)
    expect(body.at(-1).date).toBe(seed.TODAY)
  })

  it.each([
    ['from without to', '?from=2026-01-01'],
    ['to without from', '?to=2026-01-02'],
    ['malformed from', '?from=01/01/2026&to=2026-01-02'],
    ['malformed to', '?from=2026-01-01&to=yesterday'],
    ['to before from', '?from=2026-01-05&to=2026-01-02'],
    ['range beyond the cap', '?from=2020-01-01&to=2026-01-02'],
  ])('rejects %s with a 400', (_label, query) => {
    expect(get(`/api/stats/calories${query}`).status).toBe(400)
    expect(get(`/api/stats/bank${query}`).status).toBe(400)
    expect(get(`/api/weight${query}`).status).toBe(400)
  })

  it('keeps the lenient legacy `days` behaviour', () => {
    expect(get('/api/stats/calories?days=3').body).toHaveLength(3)
    expect(get('/api/stats/calories?days=nonsense').body).toHaveLength(14)
    expect(get('/api/stats/calories?days=500').body).toHaveLength(14)
  })
})

/**
 * Slice 14.6 — the weekly report's date-range picker.
 *
 * The Go handler shares resolveSeriesRange with the metrics endpoints, so the
 * fixture mirrors the same contract here: an explicit window answers for
 * exactly those calendar days, the legacy `days` window still ends today, and a
 * malformed range is a 400 rather than a silently narrowed window.
 */
describe('fixture nutrition weekly range', () => {
  it('answers for exactly the requested days, in ascending order', () => {
    const from = seed.dateOffset(9)
    const to = seed.dateOffset(3)
    const { status, body } = get(`/api/nutrition/weekly?from=${from}&to=${to}`)

    expect(status).toBe(200)
    expect(body.start_date).toBe(from)
    expect(body.end_date).toBe(to)
    expect(body.daily_data).toHaveLength(7)
    expect(body.daily_data[0].date).toBe(from)
    expect(body.daily_data.at(-1).date).toBe(to)

    // Each day's calories are the drink-inclusive figure the ring and the
    // goal-vs-consumed chart use, so the report can never disagree with them.
    const stats = get(`/api/stats/calories?from=${from}&to=${to}`).body
    for (const day of body.daily_data) {
      const statsDay = stats.find((row) => row.date === day.date)
      expect(statsDay, `stats row for ${day.date}`).toBeTruthy()
      expect(day.calories).toBe(statsDay.calories)
    }
  })

  it('clamps a future `to` to today and rejects a malformed range', () => {
    const clampy = get(`/api/nutrition/weekly?from=${seed.dateOffset(1)}&to=${seed.nextDate(seed.TODAY)}`)
    expect(clampy.status).toBe(200)
    expect(clampy.body.end_date).toBe(seed.TODAY)

    expect(get(`/api/nutrition/weekly?from=${seed.dateOffset(6)}`).status).toBe(400)
    expect(get(`/api/nutrition/weekly?to=${seed.TODAY}`).status).toBe(400)
    expect(get('/api/nutrition/weekly?from=01/01/2026&to=2026-01-02').status).toBe(400)
    expect(get(`/api/nutrition/weekly?from=${seed.dateOffset(3)}&to=${seed.dateOffset(5)}`).status).toBe(400)
  })

  it('keeps the legacy days window ending today', () => {
    const { body } = get('/api/nutrition/weekly?days=7')
    expect(body.daily_data).toHaveLength(7)
    expect(body.end_date).toBe(seed.TODAY)
  })
})
