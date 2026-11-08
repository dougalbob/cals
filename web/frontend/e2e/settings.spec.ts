import { expect, test } from '@playwright/test'
import { resetFixtures } from './support'

test.describe('Settings on a phone', () => {
  test('opens from the overflow menu and saves a custom bank window and independent ring limits', async ({ page, request }) => {
    await resetFixtures(request)
    await page.goto('/diary')

    await page.getByRole('button', { name: 'Show Foods, Recipes and Settings' }).click()
    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    await page.getByLabel(/Bank window/).selectOption('custom')
    await page.getByLabel(/Custom bank window/).fill('21')
    await page.getByLabel(/Surplus ring limit/).fill('3500')
    await page.getByLabel(/Deficit ring limit/).fill('1250')
    await page.getByRole('button', { name: 'Save account settings' }).click()
    await expect(page.getByRole('status')).toContainText('Settings saved to your account.')

    const account = await (await request.get('/api/users/me')).json()
    expect(account.bank_window_days).toBe(21)
    expect(account.bank_ring_surplus_limit_kcal).toBe(3500)
    expect(account.bank_ring_deficit_limit_kcal).toBe(1250)
  })
})
