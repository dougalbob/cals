import { expect, test } from '@playwright/test'
import { bankAsOf, isoDate, resetFixtures, tileValue, waterOn, type DiaryEntry } from './support'
import type { APIRequestContext } from '@playwright/test'

/**
 * Hydration lives on the Diary only: the Today screen keeps the drink-calorie
 * summary but deliberately has no water controls (rc22). These specs pin that
 * split, and pin the accounting underneath it — drink calories reach the bank,
 * measured water reaches the ml target — using the seeded drink ledger's own
 * numbers rather than hard-coded ones.
 */

async function drinkEntriesFor(request: APIRequestContext, date: string): Promise<DiaryEntry[]> {
  const response = await request.get(`/api/drinks/entries?date=${date}`)
  expect(response.ok(), `GET /api/drinks/entries failed with ${response.status()}`).toBeTruthy()
  return (await response.json()) as (DiaryEntry & { calories: number })[]
}

const drinkCalories = (entries: { calories: number }[]) =>
  entries.reduce((total, entry) => total + entry.calories, 0)

test.describe('Hydration controls and drink calories', () => {
  test.beforeEach(async ({ request }) => {
    await resetFixtures(request)
  })

  test('Today shows drink calories but no hydration controls', async ({ page, request }) => {
    const seeded = await drinkCalories(await drinkEntriesFor(request, isoDate(0)))
    expect(seeded, 'fixture seeds a drink ledger for today').toBeGreaterThan(0)

    await page.goto('/')
    await expect(page.getByRole('progressbar', { name: 'Water towards target' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /glass of water/ })).toHaveCount(0)
    // The drink calories are still summarised, and match the ledger exactly.
    await expect(tileValue(page, 'Drinks')).toHaveText(new RegExp(`^${seeded}\\s*kcal$`))
  })

  test('Diary carries the water glass and the quick drinks', async ({ page }) => {
    await page.goto('/diary')
    await expect(page.getByRole('progressbar', { name: 'Water towards target' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Add a 250 ml glass of water/ })).toBeVisible()
    await expect(page.getByLabel('Quick drinks').getByRole('button', { name: /^Add Tea/ })).toBeVisible()
  })

  test('tapping the glass logs one glass towards the ml target', async ({ page, request }) => {
    const today = isoDate(0)
    const before = await waterOn(request, today)
    const drinksBefore = await drinkCalories(await drinkEntriesFor(request, today))

    await page.goto('/diary')
    await page.getByRole('button', { name: /Add a 250 ml glass of water/ }).click()

    const after = await waterOn(request, today)
    expect(after.consumed_ml).toBe(before.consumed_ml + 250)
    // The glass never overdraws the target: its value is clamped, and the
    // overage is reported beside it instead.
    await expect(page.getByRole('progressbar', { name: 'Water towards target' })).toHaveAttribute(
      'aria-valuenow',
      String(Math.min(after.consumed_ml, after.target_ml)),
    )
    if (after.consumed_ml > after.target_ml) {
      await expect(page.getByText(/Target \(\+\d[\d,]* ml\) reached/)).toBeVisible()
    }

    // Water has no calories, so the day's drink total must not move.
    const drinksAfter = await drinkCalories(await drinkEntriesFor(request, today))
    expect(drinksAfter).toBe(drinksBefore)
  })

  test('long-pressing the glass removes the latest glass, not two entries', async ({ page, request }) => {
    const today = isoDate(0)
    const before = await waterOn(request, today)
    // The fixture seeds water today, so there is a glass to remove.
    expect(before.consumed_ml).toBeGreaterThanOrEqual(250)

    await page.goto('/diary')
    const glass = page.getByRole('button', { name: /Add a 250 ml glass of water/ })
    const box = await glass.boundingBox()
    expect(box).toBeTruthy()

    // Hold for longer than the 550 ms long-press threshold, then release: the
    // release must not also count as a tap that adds a glass back.
    await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + (box?.height ?? 0) / 2)
    await page.mouse.down()
    await page.waitForTimeout(750)
    await page.mouse.up()

    const confirm = page.getByRole('dialog', { name: 'Delete drink entry?' })
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'Delete' }).click()
    await expect(confirm).toBeHidden()

    await expect
      .poll(async () => (await waterOn(request, today)).consumed_ml)
      .toBe(before.consumed_ml - 250)
  })

  test('a glass logged while viewing a past date lands on that date', async ({ page, request }) => {
    const today = isoDate(0)
    const yesterday = isoDate(-1)
    const beforeToday = await waterOn(request, today)
    const beforeYesterday = await waterOn(request, yesterday)

    await page.goto(`/diary/${yesterday}`)
    await page.getByRole('button', { name: /Add a 250 ml glass of water/ }).click()

    await expect
      .poll(async () => (await waterOn(request, yesterday)).consumed_ml)
      .toBe(beforeYesterday.consumed_ml + 250)
    // …and today's own ledger is untouched.
    expect((await waterOn(request, today)).consumed_ml).toBe(beforeToday.consumed_ml)
  })

  test('a calorie drink is accounted for, and changes tomorrow’s bank', async ({ page, request }) => {
    const today = isoDate(0)
    const tomorrow = isoDate(1)
    const drinksBefore = await drinkCalories(await drinkEntriesFor(request, today))
    const waterBefore = await waterOn(request, today)
    const bankTodayBefore = await bankAsOf(request, today)
    const bankTomorrowBefore = await bankAsOf(request, tomorrow)

    await page.goto('/diary')
    // Milk is 94 kcal and does not count towards the water target.
    await page.getByLabel('Quick drinks').getByRole('button', { name: /^Add Milk/ }).click()

    const drinksAfter = await drinkCalories(await drinkEntriesFor(request, today))
    expect(drinksAfter).toBe(drinksBefore + 94)
    await expect(tileValue(page, 'Drinks')).toHaveText(new RegExp(`^${drinksAfter}\\s*kcal$`))
    await expect(page.getByRole('heading', { name: 'Drinks logged' }).locator('..')).toContainText('Milk')

    // The ml target only counts water-counting drinks, so it is unchanged.
    expect((await waterOn(request, today)).consumed_ml).toBe(waterBefore.consumed_ml)

    // Today's spend lands on the bank from tomorrow: the bank as of today is
    // untouched, and the bank as of tomorrow is 94 kcal smaller.
    expect((await bankAsOf(request, today)).bank_balance).toBe(bankTodayBefore.bank_balance)
    const bankTomorrowAfter = await bankAsOf(request, tomorrow)
    expect(bankTomorrowBefore.bank_balance - bankTomorrowAfter.bank_balance).toBe(94)
    expect(bankTomorrowBefore.today_available - bankTomorrowAfter.today_available).toBe(94)

    // The same numbers are what the household sees on Today.
    await page.goto('/')
    await expect(tileValue(page, 'Drinks')).toHaveText(new RegExp(`^${drinksAfter}\\s*kcal$`))
    const signed = `${bankTodayBefore.bank_balance >= 0 ? '+' : ''}${bankTodayBefore.bank_balance.toLocaleString('en-GB')}`
    await expect(tileValue(page, bankTodayBefore.bank_balance >= 0 ? 'Banked' : 'Deficit')).toHaveText(
      new RegExp(`^${signed.replace('+', '\\+')}\\s*kcal$`),
    )
  })
})
