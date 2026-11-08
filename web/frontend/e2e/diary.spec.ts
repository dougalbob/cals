import { expect, test } from '@playwright/test'
import { boxWithinViewport, diaryFor, isoDate, resetFixtures } from './support'

/**
 * The Diary is the app's most-used screen (breakfast, lunch, dinner, snacks and
 * the drink ledger). These specs cover the two flows that touch real layout:
 * logging food into a meal, and the mobile Edit sheet whose Cancel/Save actions
 * were reported as clipping off a phone screen.
 */

test.describe('Diary: logging and the Edit sheet', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetFixtures(request)
    await page.goto('/diary')
    await expect(page.getByRole('button', { name: /^Edit / }).first()).toBeVisible()
  })

  test('a food can be logged into a meal', async ({ page, request }) => {
    const today = isoDate(0)
    const before = await diaryFor(request, today)
    const breakfast = page.locator('#breakfast')
    await expect(breakfast.getByText('Porridge Oats')).toBeVisible()

    await breakfast.getByRole('button', { name: '+ Add food' }).click()
    // The dialog's title changes once a food is picked ("Add to Breakfast" →
    // "Add Banana"), so match it by role only.
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await dialog.getByPlaceholder('Search foods…').fill('banana')
    await dialog.getByRole('button', { name: /^Banana/ }).click()

    // The picker starts on the food's preferred measure and converts to grams.
    await dialog.getByRole('button', { name: 'Grams' }).click()
    await dialog.getByLabel('Weight (grams)').fill('100')
    await expect(dialog.getByText(/= 89 kcal/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Add to Breakfast' }).click()

    await expect(dialog).toBeHidden()
    await expect(breakfast.getByText('Banana')).toBeVisible()

    const after = await diaryFor(request, today)
    expect(after).toHaveLength(before.length + 1)
    const added = after.find((entry) => entry.id === Math.max(...after.map((e) => e.id)))
    expect(added?.meal).toBe('breakfast')
    expect(added?.quantity_grams).toBe(100)
    expect(added?.calories).toBeCloseTo(89, 1)
  })

  test('the meal-slot delete icon asks for confirmation and Cancel preserves the entry', async ({ page, request }) => {
    const today = isoDate(0)
    const entry = (await diaryFor(request, today)).find((item) => item.food_name === 'Porridge Oats')
    expect(entry, 'seeded breakfast entry').toBeTruthy()

    await page.getByRole('button', { name: `Delete ${entry?.food_name}` }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete diary entry?' })
    await expect(dialog).toContainText('Porridge Oats')
    await expect(dialog).toContainText('Breakfast')
    await expect(dialog).toContainText('This cannot be undone.')
    await expect(dialog.getByRole('button', { name: 'Delete' })).toBeVisible()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.locator('#breakfast').getByText('Porridge Oats')).toBeVisible()
    expect((await diaryFor(request, today)).some((item) => item.id === entry?.id)).toBe(true)
  })

  test('deleting a meal-slot entry requires explicit confirmation', async ({ page, request }) => {
    const today = isoDate(0)
    const entry = (await diaryFor(request, today)).find((item) => item.food_name === 'Porridge Oats')
    expect(entry, 'seeded breakfast entry').toBeTruthy()

    await page.getByRole('button', { name: `Delete ${entry?.food_name}` }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete diary entry?' })
    await expect(dialog).toBeVisible()
    expect((await diaryFor(request, today)).some((item) => item.id === entry?.id)).toBe(true)

    await dialog.getByRole('button', { name: 'Delete' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.locator('#breakfast').getByText('Porridge Oats')).toHaveCount(0)
    expect((await diaryFor(request, today)).some((item) => item.id === entry?.id)).toBe(false)
  })

  test('the Edit sheet keeps its actions on screen at phone size', async ({ page, request }) => {
    const entry = (await diaryFor(request, isoDate(0))).find((e) => e.food_name === 'Porridge Oats')
    expect(entry, 'seeded breakfast entry').toBeTruthy()

    // A short phone screen is where the reported clipping happened, so shrink
    // the viewport below the usual review size for this spec.
    await page.setViewportSize({ width: 412, height: 560 })
    await page.getByRole('button', { name: `Edit ${entry?.food_name}` }).click()

    const dialog = page.getByRole('dialog', { name: `Edit ${entry?.food_name}` })
    await expect(dialog).toBeVisible()

    const viewport = page.viewportSize()
    const scrollArea = dialog.locator('[data-modal-scroll]')
    const footer = dialog.locator('[data-modal-footer]')

    // The editable content scrolls; Cancel/Save live outside it and stay put.
    await expect(scrollArea).toBeVisible()
    await expect(footer).toBeVisible()
    expect(boxWithinViewport(await footer.boundingBox(), viewport)).toBe(true)
    await expect(footer.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await expect(footer.getByRole('button', { name: 'Save' })).toBeVisible()
    await expect(scrollArea.getByRole('button', { name: 'Save' })).toHaveCount(0)

    // The page behind the sheet is locked against user scrolling, so wheeling
    // over the sheet does not drag the diary under it.
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden')
    const lockY = await page.evaluate(() => window.scrollY)
    await page.mouse.wheel(0, 1200)
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => window.scrollY)).toBe(lockY)

    // Scrolling the sheet's own contents keeps the actions on screen.
    await scrollArea.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect(footer).toBeVisible()
    expect(boxWithinViewport(await footer.boundingBox(), viewport)).toBe(true)
  })

  test('editing a quantity rescales that entry only, and closes the sheet', async ({ page, request }) => {
    const today = isoDate(0)
    const before = await diaryFor(request, today)
    const entry = before.find((e) => e.food_name === 'Porridge Oats')
    expect(entry, 'seeded breakfast entry').toBeTruthy()
    const lunch = before.find((e) => e.food_name === 'Basmati Rice, cooked')
    expect(lunch, 'seeded lunch entry').toBeTruthy()

    await page.getByRole('button', { name: `Edit ${entry?.food_name}` }).click()
    const dialog = page.getByRole('dialog', { name: `Edit ${entry?.food_name}` })
    await dialog.getByRole('button', { name: 'Grams' }).click()

    // Nothing to save until the weight actually changes.
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled()
    const doubled = (entry?.quantity_grams ?? 0) * 2
    await dialog.getByLabel('Weight (grams)').fill(String(doubled))
    await expect(dialog.getByText(/= [\d,.]+ kcal/)).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeEnabled()

    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden()

    const after = await diaryFor(request, today)
    const edited = after.find((e) => e.id === entry?.id)
    expect(edited?.quantity_grams).toBe(doubled)
    expect(edited?.calories).toBeCloseTo((entry?.calories ?? 0) * 2, 1)
    // A saved diary row is a record: only the edited entry may move.
    expect(after.find((e) => e.id === lunch?.id)?.calories).toBe(lunch?.calories)

    // The row shows the corrected weight and the page scrolls again.
    await expect(page.locator('#breakfast').getByText(new RegExp(`^${doubled} g ·`))).toBeVisible()
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden')
  })

  test('Cancel closes the sheet without writing anything', async ({ page, request }) => {
    const today = isoDate(0)
    const entry = (await diaryFor(request, today)).find((e) => e.food_name === 'Porridge Oats')
    expect(entry).toBeTruthy()

    await page.getByRole('button', { name: `Edit ${entry?.food_name}` }).click()
    const dialog = page.getByRole('dialog', { name: `Edit ${entry?.food_name}` })
    await dialog.getByRole('button', { name: 'Grams' }).click()
    await dialog.getByLabel('Weight (grams)').fill('999')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()

    const after = await diaryFor(request, today)
    expect(after.find((e) => e.id === entry?.id)?.quantity_grams).toBe(entry?.quantity_grams)
  })
})
