/**
 * Fixture-API tests for the windowed bank (Phase 14 slice 14.2).
 *
 * The fixture mirrors internal/handlers/bank.go, calendar.go and stats.go, and
 * the Go regression tests in internal/handlers/bank_test.go. The bank is now the
 * sum of (goal − consumed) over the previous N completed calendar days, floored
 * at bank_start_date, counting only days that have logging (decisions 42, 66,
 * 91, 92). If the two implementations drift, the preview lies to whoever is
 * reviewing the numbers in it, so the same contract is pinned on both sides.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { handle } from './handler.mjs'
import * as seed from './seed.mjs'

const get = (target, headers = {}) => handle('GET', new URL(`http://localhost${target}`), null, headers)
const put = (target, body, headers = {}) => handle('PUT', new URL(`http://localhost${target}`), body, headers)
const asUser = (id) => ({ cookie: `cals_acting_user=${id}` })

/** Food + drink calories on one date, computed independently of the handler. */
const consumedOn = (date, userId) =>
  [...seed.entriesFor(date, userId), ...seed.drinkEntriesFor(date, userId)].reduce(
    (sum, entry) => sum + entry.calories,
    0,
  )

beforeEach(() => {
  seed.resetFixtures()
})

describe('fixture windowed bank', () => {
  it('defaults to the previous 14 completed calendar days', () => {
    const { status, body } = get(`/api/bank?date=${seed.TODAY}`)

    expect(status).toBe(200)
    expect(body.window_days).toBe(14)
    expect(body.window_start_date).toBe(seed.dateOffset(14))
    // The as-of date is excluded, and every day in the window is counted or
    // explicitly excluded as unlogged (decision 92).
    expect(body.days_counted + body.days_unlogged).toBe(14)
    expect(body.as_of_date).toBe(seed.TODAY)
    expect(body.today_available).toBe(body.daily_goal + body.bank_balance)
  })

  it('excludes unlogged days instead of crediting their budget (decision 42)', () => {
    // Account 2 has three days of logging against a bank that started 20 days
    // ago. Her window (the previous 14 completed days) holds two logged days,
    // so two days of budget accrue rather than fourteen — and far fewer than
    // the since-day-one rule credited.
    const goal = seed.users[1].daily_calorie_goal
    const { body } = get(`/api/bank?date=${seed.TODAY}`, asUser(2))

    expect(body.days_counted).toBe(2)
    expect(body.days_unlogged).toBe(12)

    const consumed = consumedOn(seed.dateOffset(2), 2) + consumedOn(seed.dateOffset(1), 2)
    // The window's total is rounded to a whole kcal on the wire.
    expect(body.bank_balance).toBe(Math.round(2 * goal - consumed))

    const cumulative =
      seed.daysBetween(seed.users[1].bank_start_date, seed.TODAY) * goal -
      (seed.caloriesBetween(seed.users[1].bank_start_date, seed.TODAY, 2) +
        seed.drinkCaloriesBetween(seed.users[1].bank_start_date, seed.TODAY, 2))
    expect(body.bank_balance).not.toBe(cumulative)
  })

  it('agrees with the calendar for the same date', () => {
    const from = seed.dateOffset(5)
    const calendar = get(`/api/calendar?from=${from}&to=${seed.TODAY}`).body

    expect(calendar.bank_window_days).toBe(14)
    for (const day of calendar.days) {
      const expected = get(`/api/bank?date=${seed.nextDate(day.date)}`).body
      expect(day.bank_balance, `${day.date} must match GET /api/bank`).toBe(expected.bank_balance)
    }
  })

  it('agrees with the stats series for the same date', () => {
    const from = seed.dateOffset(5)
    const series = get(`/api/stats/bank?from=${from}&to=${seed.TODAY}`).body

    expect(series.length).toBeGreaterThan(0)
    for (const row of series) {
      const expected = get(`/api/bank?date=${seed.nextDate(row.date)}`).body
      expect(row.balance, `${row.date} must match GET /api/bank`).toBe(expected.bank_balance)
    }
  })

  it('floors the window at bank_start_date and follows PUT /api/users/me', () => {
    // The seeded bank started 20 days ago, so a 90-day window is clipped at the
    // start rather than reaching past it (decision 66).
    expect(put('/api/users/me', { bank_window_days: 90 }).status).toBe(200)

    const { body } = get(`/api/bank?date=${seed.TODAY}`)
    expect(body.window_days).toBe(90)
    expect(body.window_start_date).toBe(seed.users[0].bank_start_date)
    expect(body.days_counted + body.days_unlogged).toBe(
      seed.daysBetween(body.window_start_date, seed.TODAY),
    )
  })

  it('keeps 0 as the all-time preset, which still excludes unlogged days', () => {
    expect(put('/api/users/me', { bank_window_days: 0 }, asUser(2)).status).toBe(200)

    const { body } = get(`/api/bank?date=${seed.TODAY}`, asUser(2))
    expect(body.window_days).toBe(0)
    expect(body.window_start_date).toBe(seed.users[1].bank_start_date)
    // Decision 91: no length limit, but her many unlogged days are still a wash.
    expect(body.days_counted).toBe(2)
    expect(body.days_unlogged).toBe(seed.daysBetween(seed.users[1].bank_start_date, seed.TODAY) - 2)
  })

  it('keeps each per-user bank-ring display limit independent and presentation-only', () => {
    const primaryBefore = get('/api/users/me').body
    expect(primaryBefore.bank_ring_surplus_limit_kcal).toBe(2000)
    expect(primaryBefore.bank_ring_deficit_limit_kcal).toBe(2000)

    expect(put('/api/users/me', {
      bank_ring_surplus_limit_kcal: 3500,
      bank_ring_deficit_limit_kcal: 1250,
    }, asUser(2)).status).toBe(200)
    const sarah = get('/api/users/me', asUser(2)).body
    expect(sarah.bank_ring_surplus_limit_kcal).toBe(3500)
    expect(sarah.bank_ring_deficit_limit_kcal).toBe(1250)

    const primaryAfter = get('/api/users/me').body
    expect(primaryAfter.bank_ring_surplus_limit_kcal).toBe(2000)
    expect(primaryAfter.bank_ring_deficit_limit_kcal).toBe(2000)

    expect(put('/api/users/me', { bank_ring_surplus_limit_kcal: 0 }, asUser(2)).status).toBe(400)
    const afterRejectedUpdate = get('/api/users/me', asUser(2)).body
    expect(afterRejectedUpdate.bank_ring_surplus_limit_kcal).toBe(3500)
    expect(afterRejectedUpdate.bank_ring_deficit_limit_kcal).toBe(1250)
  })

  it('rejects a negative window and keeps the stored value', () => {
    expect(put('/api/users/me', { bank_window_days: -1 }).status).toBe(400)
    expect(get(`/api/bank?date=${seed.TODAY}`).body.window_days).toBe(14)
  })
})
