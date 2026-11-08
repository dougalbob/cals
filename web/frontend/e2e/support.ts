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

export type RecipeFixture = {
  id: number
  name: string
  description: string
  instructions: string
  image_filename: string
  serves: number
  total_weight_grams: number
  total_calories: number
  calories_per_100g: number
  protein_per_100g: number
  usual_grams: number | null
  weight_is_manual: boolean
  calculated_weight_grams: number
  is_archived: boolean
  is_own_creation: boolean
  is_favourite: boolean
  meal_occasions: string[]
  dish_type?: string
  total_time_minutes: number | null
  times_logged: number
  key_foods: { food_id: number; food_name: string }[]
  ingredients: { id: number; food_id: number; food_name: string; quantity_grams: number }[]
  text_ingredients: { id: number; description: string }[]
}

/** Read a recipe straight from the fixture API, so assertions use the app's own numbers. */
export async function recipeAs(request: APIRequestContext, id: number): Promise<RecipeFixture> {
  const response = await request.get(`/api/recipes/${id}`)
  expect(response.ok(), `GET /api/recipes/${id} failed with ${response.status()}`).toBeTruthy()
  return (await response.json()) as RecipeFixture
}

/** The app renders `Math.round(value)` directly in a few card/detail lines (no thousands separators). */
export function rounded(value: number): string {
  return String(Math.round(value))
}

/** en-GB number formatting, matching the app's `formatNumber`. */
export function gb(value: number, digits = 0): string {
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

/**
 * A real touch tap, the way a phone delivers it. The element is centred first:
 * the app's bottom navigation is fixed, so anything sitting behind it would
 * take the tap instead (which is a genuine way for a tap to "do nothing", but
 * not what these tests are about).
 */
export async function touchTap(locator: Locator): Promise<void> {
  await locator.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  const box = await locator.boundingBox()
  if (!box) throw new Error('touchTap: element is not visible')
  await locator.page().touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
}
