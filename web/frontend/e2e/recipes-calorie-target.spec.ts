import { expect, test } from '@playwright/test'
import { resetFixtures, touchTap } from './support'
import { formatGrams } from '../src/lib/format'

// Issue #95: advisory only, in both dialogs, with the short-phone footer intact.
test.beforeEach(async ({ request }) => {
  await resetFixtures(request)
})

for (const desktop of [false, true]) {
  test(`calorie target in Edit recipe and Add to diary${desktop ? ' @desktop' : ''}`, async ({ page, request }) => {
    await page.setViewportSize(desktop ? { width: 1280, height: 900 } : { width: 360, height: 640 })
    const recipe = await (await request.get('/api/recipes/1')).json()
    const grams = formatGrams(375 / recipe.calories_per_100g * 100)
    await page.goto('/recipes/1')
    const edit = page.getByRole('button', { name: 'Edit recipe' })
    if (desktop) await edit.click()
    else await touchTap(edit)

    const sheet = page.getByRole('dialog')
    const calculator = sheet.getByRole('complementary', { name: 'Calorie target calculator' })
    await calculator.getByLabel('Calories to spend').fill('375')
    await expect(calculator).toContainText(`375 kcal ≈ ${grams}`)
    await expect(calculator).toContainText('Based on the saved recipe')
    await expect(sheet).toBeVisible()
    await expect.poll(() => sheet.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    await sheet.getByRole('button', { name: 'Cancel', exact: true }).click()

    const add = page.getByRole('button', { name: /Add to diary/ })
    if (desktop) await add.click()
    else await touchTap(add)
    const footer = sheet.getByRole('button', { name: 'Add to diary', exact: true })
    await calculator.getByLabel('Calories to spend').fill('375')
    await expect(calculator).toContainText(`375 kcal ≈ ${grams}`)
    await expect(sheet.getByLabel('Weight (grams)')).toHaveValue('')
    await expect(footer).toBeDisabled()
    await expect(footer).toBeInViewport()
    await expect.poll(() => sheet.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    const fractions = sheet.getByRole('button', { name: /¼/ })
    if (desktop) {
      const fractionBox = await fractions.boundingBox()
      const calculatorBox = await calculator.boundingBox()
      expect(calculatorBox!.x).toBeGreaterThan(fractionBox!.x + fractionBox!.width)
      await fractions.click()
    } else {
      await touchTap(fractions)
    }
    await expect(sheet.getByLabel('Weight (grams)')).toHaveValue(String(Math.round(recipe.total_weight_grams * 0.25 * 10) / 10))
    await calculator.getByLabel('Calories to spend').fill('99999')
    await expect(calculator).toContainText('more than the whole recipe')
    await calculator.getByLabel('Calories to spend').fill('0')
    await expect(calculator).toContainText('greater than zero')
    await calculator.getByLabel('Calories to spend').fill('')
    await expect(calculator).not.toContainText('≈')
    await expect(footer).toBeEnabled()
    await expect(footer).toBeInViewport()
  })
}

test('calculator also appears in the Diary recipe picker', async ({ page }) => {
  await page.goto('/recipes?add-to=dinner&on=2026-10-17')
  await touchTap(page.getByRole('button', { name: 'Add Chicken Curry to Dinner on 2026-10-17' }))
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Calories to spend').fill('375')
  await expect(sheet.getByRole('complementary', { name: 'Calorie target calculator' })).toContainText('375 kcal ≈')
  await expect(sheet.getByLabel('Weight (grams)')).toHaveValue('')
})
