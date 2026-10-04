import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'

/**
 * Shared helpers for the real-browser suite.
 *
 * The tests speak to the app the way a person does and use the API only to set
 * up / verify state, so a UI regression cannot be masked by reading the same
 * fixture the UI reads.
 */

/**
 * The fixture's "today", as seed.mjs builds it from the server's local date.
 * The server runs with TZ=UTC (see playwright.config.ts) and the browser is
 * pinned to UTC too, so this is deliberately UTC rather than the test runner's
 * local timezone — otherwise a machine east of UTC can disagree with the app
 * about the date for part of the day.
 */
export function isoDate(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** Restore the fixture API's seeded state so one spec cannot leak into the next. */
export async function resetFixtures(request: APIRequestContext): Promise<void> {
  const response = await request.post('/api/_test/reset')
  expect(response.ok(), `fixture reset failed with ${response.status()}`).toBeTruthy()
}

export type DiaryEntry = {
  id: number
  date: string
  meal: string
  food_name?: string
  recipe_name?: string
  quantity_grams: number
  calories: number
}

/** `GET /api/diary` wraps the rows: { date, entries, totals }. */
export async function diaryFor(request: APIRequestContext, date: string): Promise<DiaryEntry[]> {
  const response = await request.get(`/api/diary?date=${date}`)
  expect(response.ok(), `GET /api/diary failed with ${response.status()}`).toBeTruthy()
  const body = (await response.json()) as { entries?: DiaryEntry[] }
  return body.entries ?? []
}

export type BankResponse = {
  daily_goal: number
  bank_balance: number
  today_available: number
  as_of_date: string
}

export async function bankAsOf(request: APIRequestContext, date: string): Promise<BankResponse> {
  const response = await request.get(`/api/bank?date=${date}`)
  expect(response.ok(), `GET /api/bank failed with ${response.status()}`).toBeTruthy()
  return (await response.json()) as BankResponse
}

export type WaterResponse = { consumed_ml: number; target_ml: number }

export async function waterOn(request: APIRequestContext, date: string): Promise<WaterResponse> {
  const response = await request.get(`/api/water?date=${date}`)
  expect(response.ok(), `GET /api/water failed with ${response.status()}`).toBeTruthy()
  return (await response.json()) as WaterResponse
}

/** The value paragraph of a Dashboard tile, found by its label ("Drinks", "Banked"…). */
export function tileValue(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true }).locator('xpath=following-sibling::p[1]')
}

/** Parse "94 kcal" / "+1,234 kcal" out of a tile value. */
export function kcalFrom(text: string | null): number {
  const digits = (text ?? '').replace(/[^0-9+-]/g, '')
  return Number.parseInt(digits, 10)
}

/** True when `box` is fully inside the viewport (the phone screen). */
export function boxWithinViewport(
  box: { x: number; y: number; width: number; height: number } | null,
  viewport: { width: number; height: number } | null,
): boolean {
  if (!box || !viewport) return false
  return box.y >= 0 && box.y + box.height <= viewport.height + 0.5
}
