import { expect, test } from '@playwright/test'
import { recipeAs, resetFixtures, rounded } from './support'

/**
 * The recipe detail page: what it shows, the Add tag form (the checkbox-heavy
 * surface), and archiving. The portion sheet has its own spec.
 */

test.describe('Recipe detail', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetFixtures(request)
    await page.goto('/recipes/1')
    await expect(page.getByRole('heading', { name: 'Chicken Curry', level: 2 })).toBeVisible()
  })

  test('shows the recipe facts, food ingredients, notes and method', async ({ page, request }) => {
    const curry = await recipeAs(request, 1)

    await expect(page.getByText(`${rounded(curry.total_calories)} kcal total`)).toBeVisible()
    await expect(page.getByText(`${rounded(curry.total_weight_grams)} g cooked`)).toBeVisible()
    await expect(page.getByText(`Serves ${curry.serves}`)).toBeVisible()
    await expect(page.getByText(`${curry.total_time_minutes} min total`)).toBeVisible()

    const ingredients = page.getByRole('region', { name: 'Ingredients' })
    for (const ingredient of curry.ingredients) {
      const line = ingredients.getByRole('listitem').filter({ hasText: ingredient.food_name })
      await expect(line).toContainText(`${rounded(ingredient.quantity_grams)} g`)
    }
    await expect(ingredients.getByText('2 tsp curry powder')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Method' })).toContainText('Fry the onion')
  })

  test('replaces a recipe photo without cropping', async ({ page, request }) => {
    await page.getByLabel('Choose recipe photo').setInputFiles({
      name: 'replacement.webp',
      mimeType: 'image/webp',
      buffer: Buffer.from('fixture image bytes'),
    })
    await expect(page.getByText(/(?:Selected|Previewing) replacement\.webp/)).toBeVisible()
    await page.getByRole('button', { name: 'Upload photo' }).click()

    await expect.poll(async () => (await recipeAs(request, 1)).image_filename).toMatch(/^v_[a-f0-9]{32}$/)
    const recipe = await recipeAs(request, 1)
    await expect(page.getByRole('img', { name: 'Chicken Curry' })).toHaveAttribute(
      'src',
      new RegExp(`v=${recipe.image_filename}`),
    )
    await expect(page.getByRole('button', { name: 'Upload photo' })).toHaveCount(0)
  })

  test('the Add tag form ticks meal occasions and saves them', async ({ page, request }) => {
    await page.getByRole('button', { name: 'Add tag' }).click()

    const breakfast = page.getByRole('checkbox', { name: 'Breakfast' })
    await expect(breakfast).not.toBeChecked()
    await breakfast.check()
    await page.getByRole('button', { name: 'Save tags and time' }).click()

    // The chips over the photo update, and so does the API.
    await expect(page.getByRole('group', { name: 'Chicken Curry tags' }).getByText('Breakfast')).toBeVisible()
    expect((await recipeAs(request, 1)).meal_occasions).toContain('breakfast')

    await page.reload()
    await expect(page.getByRole('group', { name: 'Chicken Curry tags' }).getByText('Breakfast')).toBeVisible()
  })

  test('only two key foods can be chosen, and un-ticking one frees a slot', async ({ page, request }) => {
    await page.getByRole('button', { name: 'Add tag' }).click()

    // Chicken Curry's key foods are already Chicken and Rice, so the other two
    // ingredients are offered but locked until a slot frees up.
    const chicken = page.getByRole('checkbox', { name: 'Chicken Breast, grilled' })
    const oil = page.getByRole('checkbox', { name: 'Olive Oil' })
    await expect(chicken).toBeChecked()
    await expect(oil).toBeDisabled()

    await chicken.uncheck()
    await expect(oil).toBeEnabled()
    await oil.check()
    await page.getByRole('button', { name: 'Save tags and time' }).click()

    const keyFoods = (await recipeAs(request, 1)).key_foods.map((food) => food.food_name)
    expect(keyFoods).toContain('Olive Oil')
    expect(keyFoods).not.toContain('Chicken Breast, grilled')
  })

  test('Cancel throws away tag edits', async ({ page }) => {
    await page.getByRole('button', { name: 'Add tag' }).click()
    await page.getByRole('checkbox', { name: 'Breakfast' }).check()
    await page.getByRole('button', { name: 'Cancel' }).click()

    await expect(page.getByRole('group', { name: 'Chicken Curry tags' }).getByText('Breakfast')).toHaveCount(0)
    await page.getByRole('button', { name: 'Add tag' }).click()
    await expect(page.getByRole('checkbox', { name: 'Breakfast' })).not.toBeChecked()
  })

  test('the total time saves and appears with the recipe facts', async ({ page }) => {
    await page.getByRole('button', { name: 'Add tag' }).click()
    await page.getByLabel('Total prep-to-plate time (minutes)').fill('45')
    await page.getByRole('button', { name: 'Save tags and time' }).click()

    await expect(page.getByText('45 min total')).toBeVisible()
  })

  test('archiving takes two taps and can be undone', async ({ page, request }) => {
    await page.getByRole('button', { name: 'Archive recipe' }).click()
    // Nothing happens until the confirmation is answered.
    await expect(page.getByRole('status', { name: 'Archived recipe' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Keep it' }).click()
    await expect(page.getByRole('button', { name: 'Archive recipe' })).toBeVisible()
    expect((await recipeAs(request, 1)).is_archived).toBe(false)

    await page.getByRole('button', { name: 'Archive recipe' }).click()
    await page.getByRole('button', { name: 'Yes, archive it' }).click()

    await expect(page.getByRole('status', { name: 'Archived recipe' })).toContainText('This recipe is archived')
    await expect(page.getByRole('button', { name: '🍽 Add to diary' })).toHaveCount(0)
    expect((await recipeAs(request, 1)).is_archived).toBe(true)

    await page.getByRole('button', { name: 'Restore recipe' }).click()
    await expect(page.getByRole('status', { name: 'Archived recipe' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '🍽 Add to diary' })).toBeVisible()
  })

  test('an archived recipe explains itself and offers no logging', async ({ page, request }) => {
    await request.put('/api/recipes/1/archive', { data: { is_archived: true } })
    await page.reload()

    await expect(page.getByRole('status', { name: 'Archived recipe' })).toContainText('hidden from the recipe list')
    await expect(page.getByRole('button', { name: '🍽 Add to diary' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Restore recipe' })).toBeVisible()
  })

  test('a bad link says so instead of failing silently', async ({ page }) => {
    await page.goto('/recipes/not-a-number')
    await expect(page.getByRole('alert')).toContainText('Recipe not found')
  })
})
