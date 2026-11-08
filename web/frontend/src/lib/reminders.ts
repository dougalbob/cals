/**
 * Reminders bell presentation (decisions 121–122).
 *
 * The server has already decided what is due (GET /api/reminders lists only
 * active items); everything here is pure presentation — the copy, and the deep
 * link each item's action opens:
 *
 *   weigh_in        → /metrics?open=weigh-in      (the weigh-in sheet opens)
 *   body_measurements → /metrics?open=measurements (the body map scrolls into view)
 *   weekly_report   → /metrics?report=week&report_anchor=<the week's Monday>
 *
 * The cadence nags have no dismissal: logging the data is what clears them
 * (owner direction 2026-10-07). The weekly-report advisory clears on the
 * server once a completed report has actually been displayed.
 */

import type { ReminderItem } from '../api/types'
import { formatWeekRangeLabel } from './calendar'
import { formatShortDate } from './format'

/** Human title for the item. */
export function reminderTitle(item: ReminderItem): string {
  switch (item.type) {
    case 'weigh_in':
      return 'Time to weigh in'
    case 'body_measurements':
      return 'Time for body measurements'
    case 'weekly_report':
      return 'Weekly report ready'
  }
}

/** The supporting line: when the data was last recorded, or what is ready. */
export function reminderDetail(item: ReminderItem): string {
  switch (item.type) {
    case 'weigh_in':
      return cadenceDetail(item, 'No weigh-in recorded yet', 'Last weigh-in')
    case 'body_measurements':
      return cadenceDetail(item, 'No measurements recorded yet', 'Last measured')
    case 'weekly_report':
      return item.week_from && item.week_to
        ? `Your report for ${formatWeekRangeLabel(item.week_from, item.week_to)} is complete`
        : 'Your report for last week is complete'
  }
}

function cadenceDetail(item: ReminderItem, empty: string, prefix: string): string {
  if (item.last_date === null) return empty
  const days = item.days_since ?? 0
  const ago = days === 1 ? '1 day ago' : `${days} days ago`
  return `${prefix} ${formatShortDate(item.last_date)} · ${ago}`
}

/** Button label for the one action each item offers. */
export function reminderActionLabel(item: ReminderItem): string {
  switch (item.type) {
    case 'weigh_in':
      return 'Log weigh-in'
    case 'body_measurements':
      return 'Add measurements'
    case 'weekly_report':
      return 'View report'
  }
}

/** Where that action goes. The Metrics route reads `open` / `report_*` from the URL. */
export function reminderActionPath(item: ReminderItem): string {
  switch (item.type) {
    case 'weigh_in':
      return '/metrics?open=weigh-in'
    case 'body_measurements':
      return '/metrics?open=measurements'
    case 'weekly_report':
      return item.week_from ? `/metrics?report=week&report_anchor=${item.week_from}` : '/metrics'
  }
}
