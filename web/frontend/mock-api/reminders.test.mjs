/**
 * Fixture-API tests for the reminders bell (decisions 121–122).
 *
 * The fixture mirrors internal/handlers/reminders.go and its regression tests
 * in internal/handlers/reminders_test.go. The cadence nags are derived from
 * the logged data (logging clears them; nothing dismisses them), and the
 * weekly-report advisory resolves against the per-user seen watermark. If the
 * two implementations drift, the preview lies to whoever is reviewing the bell
 * in it, so the same contract is pinned on both sides.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { handle } from './handler.mjs'
import * as seed from './seed.mjs'

const get = (target, headers = {}) => handle('GET', new URL(`http://localhost${target}`), null, headers)
const post = (target, body, headers = {}) => handle('POST', new URL(`http://localhost${target}`), body, headers)
const asUser = (id) => ({ cookie: `cals_acting_user=${id}` })

beforeEach(() => {
  seed.resetFixtures()
})

/** The previous Monday–Sunday week, derived from the calendar not the handler. */
function lastCompletedWeek() {
  const dow = (new Date(`${seed.TODAY}T00:00:00Z`).getUTCDay() + 6) % 7 // Mon=0 … Sun=6
  return { from: seed.dateOffset(dow + 7), to: seed.dateOffset(dow + 1) }
}

const findItem = (body, type) => body.items.find((item) => item.type === type) ?? null

describe('fixture reminders (decisions 121–122)', () => {
  it('lists all three reminders for the account that is behind, and only the report for the one that is not', () => {
    // Sarah (account 2) last weighed five days ago and measured twenty —
    // past both windows — and nobody has viewed a completed report.
    const behind = get('/api/reminders', asUser(2)).body
    expect(behind.items.map((item) => item.type)).toEqual(['weigh_in', 'body_measurements', 'weekly_report'])

    const weighIn = findItem(behind, 'weigh_in')
    expect(weighIn.last_date).toBe(seed.dateOffset(5))
    expect(weighIn.days_since).toBe(5)
    expect(weighIn.cadence_days).toBe(3)

    const measured = findItem(behind, 'body_measurements')
    expect(measured.last_date).toBe(seed.dateOffset(20))
    expect(measured.days_since).toBe(20)
    expect(measured.cadence_days).toBe(14)

    const week = lastCompletedWeek()
    const report = findItem(behind, 'weekly_report')
    expect(report.week_from).toBe(week.from)
    expect(report.week_to).toBe(week.to)

    // Dougal (account 1) weighed within the window and measured 3 days ago:
    // only the report advisory is left, and the data never crosses accounts.
    const caughtUp = get('/api/reminders').body
    expect(caughtUp.items.map((item) => item.type)).toEqual(['weekly_report'])
  })

  it('clears the cadence nags as soon as the data is logged, and only then', () => {
    // A weigh-in exactly three days ago is due at the boundary…
    post('/api/weight', { date: seed.dateOffset(3), weight_kg: 70.2 }, asUser(2))
    let body = get('/api/reminders', asUser(2)).body
    expect(findItem(body, 'weigh_in').days_since).toBe(3)

    // …and today's weigh-in clears it. There is no dismissal path.
    post('/api/weight', { date: seed.TODAY, weight_kg: 70.1 }, asUser(2))
    body = get('/api/reminders', asUser(2)).body
    expect(findItem(body, 'weigh_in')).toBeNull()

    post('/api/measurements', { date: seed.TODAY, waist_cm: 80.0 }, asUser(2))
    body = get('/api/reminders', asUser(2)).body
    expect(findItem(body, 'body_measurements')).toBeNull()
  })

  it('clears the weekly-report advisory when the completed week is viewed, monotonically', () => {
    const week = lastCompletedWeek()

    // An older period moves the watermark but cannot clear the newer one.
    const older = seed.dateOffset(21)
    const first = post('/api/reminders/weekly-report-seen', { week_to: older }, asUser(2))
    expect(first.status).toBe(200)
    expect(first.body.seen_through).toBe(older)
    expect(findItem(get('/api/reminders', asUser(2)).body, 'weekly_report')).not.toBeNull()

    const seen = post('/api/reminders/weekly-report-seen', { week_to: week.to }, asUser(2))
    expect(seen.body.seen_through).toBe(week.to)
    expect(findItem(get('/api/reminders', asUser(2)).body, 'weekly_report')).toBeNull()

    // Re-reading an older report never brings it back.
    const again = post('/api/reminders/weekly-report-seen', { week_to: older }, asUser(2))
    expect(again.body.seen_through).toBe(week.to)
    expect(findItem(get('/api/reminders', asUser(2)).body, 'weekly_report')).toBeNull()
  })

  it('refuses to mark a report seen for a period that has not finished', () => {
    expect(post('/api/reminders/weekly-report-seen', { week_to: seed.dateOffset(-1) }).status).toBe(400)
    expect(post('/api/reminders/weekly-report-seen', { week_to: '07/10/2026' }).status).toBe(400)
    expect(post('/api/reminders/weekly-report-seen', {}).status).toBe(400)
    // The watermark survives a bad request untouched.
    expect(findItem(get('/api/reminders').body, 'weekly_report')).not.toBeNull()
  })

  it('keeps each household account on its own watermark', () => {
    const week = lastCompletedWeek()
    post('/api/reminders/weekly-report-seen', { week_to: week.to }, asUser(1))
    expect(findItem(get('/api/reminders').body, 'weekly_report')).toBeNull()
    expect(findItem(get('/api/reminders', asUser(2)).body, 'weekly_report')).not.toBeNull()
  })
})
