import { expect, test } from '@playwright/test'
import { gb, recipeAs, resetFixtures } from './support'

/**
 * Edit recipe — the content editor sheet: what is editable, what is fixed,
 * the validation messages, and that Cancel really does throw the edits away.
 */

test.describe('Edit recipe', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetFixtures(request)
    await page.goto('/recipes/1')
    await page.getByRole('button', { name: 'Edit recipe' }).click()
    await expect(page.getByRole('dialog', { name: 'Edit Chicken Curry' })).toBeVisible()
  })

  test('the name is fixed and every editable field is filled in', async ({ page, request }) => {
    const curry = await recipeAs(request, 1)
    const name = page.getByLabel('Recipe name (fixed)')

    await expect(name).toHaveValue('Chicken Curry')
    await expect(name).toHaveAttribute('readonly', '')
    await expect(page.getByLabel('Description')).toHaveValue(curry.description)
    await expect(page.getByLabel('Serves')).toHaveValue(String(curry.serves))
    for (const ingredient of curry.ingredients) {
      await expect(page.getByLabel(new RegExp(`^${ingredient.food_name} weight`))).toBeVisible()
    }
  })

  test('the measured cooked weight tick switches between measured and calculated', async ({ page, request }) => {
    const curry = await recipeAs(request, 1)
    const measured = page.getByRole('checkbox', { name: 'I measured the cooked weight' })

    // The seeded recipe carries a measured weight (1050 g vs the 1215 g its
    // ingredients add up to), so the tick is on and the field is showing.
    expect(curry.weight_is_manual).toBe(true)
    await expect(measured).toBeChecked()
    await expect(page.getByLabel('Cooked weight (grams)', { exact: true })).toHaveValue('1050')

    await measured.uncheck()
    await expect(page.getByText(/Calculated from food quantities/)).toBeVisible()
    await expect(page.getByText('1,215.0 g')).toBeVisible()

    await measured.check()
    await expect(page.getByLabel('Cooked weight (grams)', { exact: true })).toHaveValue('1050')
  })

  test('a measured cooked weight is saved and changes the per-100 g figure', async ({ page, request }) => {
    await page.getByRole('checkbox', { name: 'I measured the cooked weight' }).check()
    await page.getByLabel('Cooked weight (grams)', { exact: true }).fill('900')
    await page.getByRole('button', { name: 'Save recipe' }).click()

    await expect(page.getByRole('dialog')).toHaveCount(0)
    const updated = await recipeAs(request, 1)
    expect(updated.total_weight_grams).toBe(900)
    await expect(page.getByText(`${gb(updated.total_weight_grams)} g cooked`)).toBeVisible()
  })

  test('serves cannot be saved as zero', async ({ page, request }) => {
    const before = await recipeAs(request, 1)
    await page.getByLabel('Serves').fill('0')
    await page.getByRole('button', { name: 'Save recipe' }).click()

    // The number field carries min="1", so the browser's own constraint check
    // stops the submit before the app's message is reached. Either way nothing
    // is saved and the editor stays open.
    await expect(page.getByLabel('Serves')).toHaveAttribute('min', '1')
    await expect(page.getByLabel('Serves')).toBeEnabled()
    await page.waitForTimeout(300)
    await expect(page.getByRole('dialog')).toBeVisible()
    expect((await recipeAs(request, 1)).serves).toBe(before.serves)

    await page.getByLabel('Serves').fill('6')
    await page.getByRole('button', { name: 'Save recipe' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect((await recipeAs(request, 1)).serves).toBe(6)
  })

  test('a measured weight needs a number', async ({ page }) => {
    await page.getByRole('checkbox', { name: 'I measured the cooked weight' }).check()
    await page.getByLabel('Cooked weight (grams)', { exact: true }).fill('')
    await page.getByRole('button', { name: 'Save recipe' }).click()

    await expect(page.getByRole('alert')).toHaveText('Enter a measured cooked weight greater than zero grams.')
  })

  test('a note can be added and removed, and the description saved', async ({ page, request }) => {
    await page.getByLabel('Description').fill('Batch-cooked Friday curry — updated.')
    await page.getByRole('button', { name: '+ Add text ingredient' }).click()
    await page.getByRole('textbox', { name: 'Text ingredient 4' }).fill('a squeeze of lime')
    // Removing asks first (decision 105), so the check is two taps.
    await page.getByRole('button', { name: 'Remove text ingredient 2' }).click()
    await page.getByRole('button', { name: 'Yes, remove' }).click()
    await page.getByRole('button', { name: 'Save recipe' }).click()

    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByText('Batch-cooked Friday curry — updated.')).toBeVisible()

    const updated = await recipeAs(request, 1)
    const notes = updated.text_ingredients.map((ingredient) => ingredient.description)
    expect(notes).toContain('a squeeze of lime')
    expect(notes).not.toContain('1 onion')
  })

  test('Cancel closes the editor without saving', async ({ page, request }) => {
    await page.getByLabel('Description').fill('Should not be saved')
    await page.getByRole('button', { name: 'Cancel' }).click()

    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByText('Should not be saved')).toHaveCount(0)
    expect((await recipeAs(request, 1)).description).toBe('Batch-cooked Friday curry. Freezes well.')
  })
})
