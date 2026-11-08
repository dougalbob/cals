import { apiGet } from './client'
import type { CalendarResponse } from './types'

/**
 * Fetch per-day summaries for a contiguous date range (decision 49 calendar).
 *
 * Both endpoints are inclusive. The server caps ranges at 400 days so a typo
 * cannot pull the entire history in one request; the UI only ever asks for
 * roughly 6 weeks (month view) or one week at a time.
 */
export function getCalendar(from: string, to: string): Promise<CalendarResponse> {
  const params = new URLSearchParams({ from, to })
  return apiGet<CalendarResponse>(`/api/calendar?${params.toString()}`)
}
