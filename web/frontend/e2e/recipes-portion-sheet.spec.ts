import { expect, test, type Page } from '@playwright/test'
import { diaryFor, gb, isoDate, recipeAs, resetFixtures } from './support'

/**
 * The portion sheet: fractions of the whole recipe, direct grams, the
 * remembered "usual", meal choice, and what Add to diary actually writes.
 *
 * Recipe 3 (Salmon Traybake) is seeded with a remembered usual of 390 g;
 * recipe 1 (Chicken Curry) has never been logged, which is the other half of
 * the behaviour.
 */

const TODAY = isoDate(0)

/** The sheet's live "195 g = 302 kcal" feedback line. */
function sheetButton(page: Page, name: string) {
  return page.getByRole('dialog').getByRole('button', { name, exact: true })
}

function feedback(page: Page) {
  return page.locator('[data-modal-scroll] p[aria-live="polite"]')
}

test.describe('Recipe portion sheet', () => {
  test.beforeEach(async ({ request }) => {
    await resetFixtures(request)
  })

  test('opens with the remembered usual and follows the fraction buttons', async ({ page, request }) => {
    const salmon = await recipeAs(request, 3)
    expect(salmon.usual_grams).toBe(390)

    await page.goto('/recipes/3')
    await page.getByRole('button', { name: '🍽 Add to diary' }).click()

    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    await expect(page.getByLabel('Weight (grams)')).toHaveValue('390')
    // 390 g of a 780 g recipe is exactly half.
    await expect(sheet.getByRole('button', { name: /^½/ })).toHaveAttribute('aria-pressed', 'true')

    await sheet.getByRole('button', { name: /^¼/ }).click()
    await expect(page.getByLabel('Weight (grams)')).toHaveValue('195')
    await expect(feedback(page)).toHaveText(`195 g = ${gb(salmon.calories_per_100g * 1.95)} kcal`)

    await sheet.getByRole('button', { name: /^All/ }).click()
    await expect(page.getByLabel('Weight (grams)')).toHaveValue('780')
  })

  test('typing grams beats the fraction and updates the calories', async ({ page, request }) => {
    const salmon = await recipeAs(request, 3)
    await page.goto('/recipes/3')
    await page.getByRole('button', { name: '🍽 Add to diary' }).click()

    await page.getByLabel('Weight (grams)').fill('250')
    await expect(feedback(page)).toHaveText(`250 g = ${gb(salmon.calories_per_100g * 2.5)} kcal`)
    // The fraction chips no longer claim a match.
    await expect(page.getByRole('dialog').getByRole('button', { name: /^½/ })).toHaveAttribute('aria-pressed', 'false')
  })

  test('a one-off portion keeps the old usual, and ticking the box replaces it', async ({ page, request }) => {
    await page.goto('/recipes/3')
    await page.getByRole('button', { name: '🍽 Add to diary' }).click()

    // Nothing to tick until the amount differs from the remembered 390 g.
    const makeUsual = page.getByRole('checkbox', { name: 'Make this my usual portion' })
    await expect(makeUsual).toHaveCount(0)
    await page.getByLabel('Weight (grams)').fill('200')
    await expect(makeUsual).toBeVisible()

    // Logged as a one-off, the sheet says so and the usual is untouched.
    await sheetButton(page, 'Add to diary').click()
    await expect(page.getByRole('dialog').getByRole('status')).toHaveText('Logged 200 g to today.')
    expect((await recipeAs(request, 3)).usual_grams).toBe(390)

    // Ticking the box makes the change stick.
    await page.getByRole('button', { name: 'Done' }).click()
    await page.getByRole('button', { name: '🍽 Add to diary' }).click()
    await page.getByLabel('Weight (grams)').fill('200')
    await page.getByRole('checkbox', { name: 'Make this my usual portion' }).check()
    await sheetButton(page, 'Add to diary').click()
    await expect(page.getByRole('dialog').getByRole('status')).toContainText('saved as your usual portion')
    expect((await recipeAs(request, 3)).usual_grams).toBe(200)
  })

  test('a first-ever portion quietly becomes the usual', async ({ page, request }) => {
    const curry = await recipeAs(request, 1)
    expect(curry.usual_grams).toBeNull()

    await page.goto('/recipes/1')
    await page.getByRole('button', { name: '🍽 Add to diary' }).click()
    // Nothing is preselected for a recipe that has never been logged.
    await expect(page.getByLabel('Weight (grams)')).toHaveValue('')
    await expect(sheetButton(page, 'Add to diary')).toBeDisabled()

    await page.getByLabel('Weight (grams)').fill('300')
    await expect(page.getByText(/We’ll remember this as your usual portion/)).toBeVisible()
    await sheetButton(page, 'Add to diary').click()
    await expect(page.getByRole('dialog').getByRole('status')).toContainText('saved as your usual portion')

    const entries = (await diaryFor(request, TODAY)).filter((entry) => entry.recipe_name === 'Chicken Curry')
    expect(entries).toHaveLength(1)
    expect(entries[0].quantity_grams).toBe(300)
  })

  test('Cancel closes the sheet and writes nothing', async ({ page, request }) => {
    const before = (await diaryFor(request, TODAY)).length
    await page.goto('/recipes/3')
    await page.getByRole('button', { name: '🍽 Add to diary' }).click()
    await sheetButton(page, 'Cancel').click()

    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect((await diaryFor(request, TODAY)).length).toBe(before)
  })

  test('the meal buttons choose where the portion lands', async ({ page, request }) => {
    await page.goto('/recipes/3')
    await page.getByRole('button', { name: '🍽 Add to diary' }).click()

    await page.getByRole('dialog').getByRole('button', { name: 'Snacks' }).click()
    await sheetButton(page, 'Add to diary').click()
    await expect(page.getByRole('dialog').getByRole('status')).toContainText('Logged 390 g')

    const logged = (await diaryFor(request, TODAY)).find((entry) => entry.recipe_name === 'Salmon Traybake')
    expect(logged?.meal).toBe('snacks')
    expect(logged?.quantity_grams).toBe(390)
  })
})
