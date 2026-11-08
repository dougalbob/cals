import { expect, test } from '@playwright/test'
import { isoDate, resetFixtures } from './support'

/**
 * Phase 14.6 on a phone: the weekly report card in Metrics (decision 46) pages
 * one week at a time, opens on the current week (decision 108), offers a free
 * custom date range (decision 107) and names the days it excluded as unlogged
 * (decision 42).
 */

test.describe('Metrics weekly report', () => {
  test('opens on the current week, pages back and names unlogged days', async ({ page, request }) => {
    await resetFixtures(request)
    await page.goto('/metrics')

    const report = page.getByTestId('weekly-report')
    await report.scrollIntoViewIfNeeded()
    await expect(report).toBeVisible()

    const range = page.getByTestId('report-range')
    await expect(range).toContainText('· so far')
    const firstWeek = (await range.textContent()) as string

    await page.getByTestId('report-prev').click()
    await expect(range).not.toHaveText(firstWeek)
    await expect(page).toHaveURL(/report_anchor=\d{4}-\d{2}-\d{2}/)
    // A past week is complete, so the label drops the "so far" marker.
    await expect(range).not.toContainText('so far')

    // Paging far enough back reaches days before the fixture's diary starts;
    // they are named as excluded rather than silently dropping out.
    for (let i = 0; i < 3; i += 1) {
      await page.getByTestId('report-prev').click()
    }
    await expect(page.getByTestId('report-excluded')).toContainText('Excluded as unlogged')
    await expect(page.getByTestId('report-logged-line')).toContainText('0 of 7 days logged')

    // Back to the current week: the report params are cleared, so the clean
    // /metrics URL (and the charts' own window) is untouched.
    await page.getByTestId('report-mode-week').click()
    await expect(page).not.toHaveURL(/report_anchor/)
    await expect(range).toContainText('· so far')
  })

  test('applies a custom date range', async ({ page, request }) => {
    await resetFixtures(request)
    await page.goto('/metrics')

    await page.getByTestId('weekly-report').scrollIntoViewIfNeeded()
    await page.getByTestId('report-mode-custom').click()

    // The fixture's diary covers the last 22 days, so this window includes
    // both logged and unlogged days.
    const from = isoDate(-30)
    const to = isoDate(-8)
    await page.getByTestId('report-from').fill(from)
    await page.getByTestId('report-to').fill(to)
    await page.getByTestId('report-apply').click()

    await expect(page).toHaveURL(new RegExp(`report_from=${from}`))
    await expect(page.getByTestId('report-range')).toContainText('23 days')
    await expect(page.getByTestId('report-logged-line')).toContainText('14 of 23 days logged')
    await expect(page.getByTestId('report-excluded')).toContainText('Excluded as unlogged')

    // A backwards range is refused with a visible explanation.
    await page.getByTestId('report-to').fill(isoDate(-35))
    await page.getByTestId('report-apply').click()
    await expect(page.getByRole('alert')).toContainText('start date must be on or before')
  })
})
