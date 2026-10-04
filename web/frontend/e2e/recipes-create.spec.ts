import { expect, test } from '@playwright/test'
import { boxWithinViewport, recipeAs, resetFixtures } from './support'

/** Create recipe content and optionally upload a direct, uncropped photo. */
test.describe('Create recipe', () => {
  test.beforeEach(async ({ page, request }) => {
    await resetFixtures(request)
    await page.goto('/recipes')
    await page.getByRole('link', { name: 'Create recipe' }).click()
    await expect(page.getByRole('heading', { name: 'Create a recipe' })).toBeVisible()
  })

  test('creates content and shared tags, then opens the finished recipe', async ({ page, request }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await page.getByLabel('Recipe name').fill('Weeknight chicken bowl')
    await page.getByLabel('Description').fill('A simple, filling dinner.')
    await page.getByLabel('Search cals Foods to add').fill('Chicken Breast')
    await page.getByRole('button', { name: 'Add Chicken Breast, grilled to recipe' }).click()
    await page.getByLabel(/^Chicken Breast, grilled weight/).fill('250')

    await page.getByRole('checkbox', { name: 'I measured the cooked weight' }).check()
    await page.getByLabel('Cooked weight (grams)', { exact: true }).fill('200')
    await page.getByLabel('Serves').fill('3')
    await page.getByRole('button', { name: '+ Add text ingredient' }).click()
    await page.getByRole('textbox', { name: 'Text ingredient 1' }).fill('A squeeze of lemon')
    await page.getByLabel('Method / instructions').fill('Cook the chicken and serve warm.')
    await page.getByRole('checkbox', { name: 'Dinner' }).check()
    await page.getByLabel('Dish type').selectOption('main')
    await page.getByRole('checkbox', { name: 'Own creation' }).check()
    await page.getByRole('checkbox', { name: 'Chicken Breast, grilled' }).check()
    await page.getByLabel('Total prep-to-plate time (minutes)').fill('40')

    const create = page.getByRole('button', { name: 'Create recipe' })
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    const createBox = await create.boundingBox()
    const navigationBox = await page.getByRole('navigation', { name: 'Primary navigation' }).boundingBox()
    expect(boxWithinViewport(createBox, await page.evaluate(() => ({ width: innerWidth, height: innerHeight })))).toBe(true)
    expect(createBox && navigationBox && createBox.y + createBox.height).toBeLessThan(navigationBox?.y ?? 0)
    await create.click()

    await expect(page.getByRole('heading', { name: 'Weeknight chicken bowl' })).toBeVisible()
    const created = await recipeAs(request, 5)
    expect(created).toMatchObject({
      description: 'A simple, filling dinner.',
      instructions: 'Cook the chicken and serve warm.',
      serves: 3,
      total_weight_grams: 200,
      calculated_weight_grams: 250,
      weight_is_manual: true,
      total_calories: 412.5,
      is_own_creation: true,
      meal_occasions: ['dinner'],
      dish_type: 'main',
      total_time_minutes: 40,
      image_filename: '',
    })
    expect(created.key_foods).toEqual([{ food_id: 5, food_name: 'Chicken Breast, grilled' }])
    expect(created.text_ingredients.map((ingredient) => ingredient.description)).toEqual(['A squeeze of lemon'])
    await expect(page.getByText('NO PHOTO YET')).toBeVisible()
    await expect(page.getByRole('button', { name: '🍽 Add to diary' })).toBeVisible()

    await page.getByRole('link', { name: /Back to recipes/ }).click()
    await expect(page.getByRole('link', { name: 'View Weeknight chicken bowl' })).toBeVisible()
  })

  test('uploads a selected photo after creation', async ({ page, request }) => {
    await page.getByLabel('Recipe name').fill('Photo upload recipe')
    await page.getByLabel('Choose recipe photo').setInputFiles({
      name: 'recipe.png',
      mimeType: 'image/png',
      buffer: Buffer.from('fixture image bytes'),
    })
    await page.getByRole('button', { name: 'Create recipe' }).click()

    await expect(page.getByRole('heading', { name: 'Photo upload recipe' })).toBeVisible()
    const created = await recipeAs(request, 5)
    expect(created.image_filename).toMatch(/^v_[a-f0-9]{32}$/)
    await expect(page.getByRole('img', { name: 'Photo upload recipe' })).toHaveAttribute(
      'src',
      new RegExp(`v=${created.image_filename}`),
    )
  })

  test('explains that a saved recipe can be retried when its first photo upload fails', async ({ page, request }) => {
    await page.route('**/api/recipes/*/image', (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'temporary upload failure' }),
    }))
    await page.getByLabel('Recipe name').fill('Recipe saved before photo')
    await page.getByLabel('Choose recipe photo').setInputFiles({
      name: 'recipe.png',
      mimeType: 'image/png',
      buffer: Buffer.from('fixture image bytes'),
    })
    await page.getByRole('button', { name: 'Create recipe' }).click()

    await expect(page.getByRole('heading', { name: 'Recipe saved before photo' })).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('Photo upload failed')
    await expect(page.getByRole('alert')).toContainText('already saved')
    await expect(page.getByRole('alert')).toContainText('don\'t create another recipe')
    await expect(page.getByLabel('Choose recipe photo')).toBeVisible()
    expect((await recipeAs(request, 5)).image_filename).toBe('')
  })

  test('the form stays clear and its actions remain above fixed navigation on a short phone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 })

    const description = await page.getByRole('textbox', { name: 'Description' }).boundingBox()
    const create = page.getByRole('button', { name: 'Create recipe' })
    const initialCreate = await create.boundingBox()
    expect(description && initialCreate).toBeTruthy()
    const descriptionIsCovered = Boolean(description && initialCreate
      && initialCreate.x < description.x + description.width
      && initialCreate.x + initialCreate.width > description.x
      && initialCreate.y < description.y + description.height
      && initialCreate.y + initialCreate.height > description.y)
    expect(descriptionIsCovered).toBe(false)

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await expect(create).toBeVisible()
    const createBox = await create.boundingBox()
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
    const navigationBox = await page.getByRole('navigation', { name: 'Primary navigation' }).boundingBox()
    expect(boxWithinViewport(createBox, viewport)).toBe(true)
    expect(createBox && navigationBox && createBox.y + createBox.height).toBeLessThan(navigationBox?.y ?? 0)
  })
})
