import { expect, test } from '@playwright/test'
import { boxWithinViewport, resetFixtures } from './support'

/**
 * A thin desktop pass. The main suite is phone-first, but a phone-only fix can
 * break the desktop layout (centred dialogs, multi-column cards), so every
 * screen gets one render check and the Edit sheet gets a dialog check here.
 */

test.describe('Desktop smoke @desktop', () => {
  test('the main screens render at desktop width', async ({ page, request }) => {
    await resetFixtures(request)

    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Open the full diary →' })).toBeVisible()

    await page.goto('/diary')
    await expect(page.getByRole('button', { name: /^Edit / }).first()).toBeVisible()
    await expect(page.getByRole('progressbar', { name: 'Water towards target' })).toBeVisible()

    await page.goto('/recipes')
    await expect(page.getByRole('link', { name: 'View Chicken Curry' })).toBeVisible()

    await page.goto('/calendar')
    await expect(page.getByText('Month', { exact: true })).toBeVisible()
  })

  test('the Diary Edit dialog is centred and keeps its actions visible @desktop', async ({ page, request }) => {
    await resetFixtures(request)
    await page.goto('/diary')
    await page.getByRole('button', { name: 'Edit Porridge Oats' }).click()

    const dialog = page.getByRole('dialog', { name: 'Edit Porridge Oats' })
    await expect(dialog).toBeVisible()
    const footer = dialog.locator('[data-modal-footer]')
    await expect(footer.getByRole('button', { name: 'Save' })).toBeVisible()
    expect(boxWithinViewport(await footer.boundingBox(), page.viewportSize())).toBe(true)

    // The desktop layout centres the dialog rather than pinning it to the bottom.
    const dialogBox = await dialog.boundingBox()
    const viewport = page.viewportSize()
    expect(dialogBox && viewport ? dialogBox.y : -1).toBeGreaterThan(0)
  })
})
