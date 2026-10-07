import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { apiGet, queryKeys } from '../api/client'
import type { RemindersResponse } from '../api/types'
import { Modal } from './Modal'
import {
  reminderActionLabel,
  reminderActionPath,
  reminderDetail,
  reminderTitle,
} from '../lib/reminders'

/**
 * The reminders bell (decisions 121–122) — the first slice of the Issues bell
 * (decision 42).
 *
 * A header bell with a badge count, acting for the user whose data is on
 * screen (including the Admin's "Viewing as" switch). Opening it lists what is
 * currently asking for attention:
 *
 *  - the weigh-in nag (due at 3+ days since the last one),
 *  - the body-measurements nag (due at 14+ days since the last session),
 *  - the weekly-report advisory (the most recent completed week, until the
 *    report has been viewed).
 *
 * The cadence nags are derived from live data, so logging the entry clears
 * them — there is deliberately no dismiss or snooze (owner direction
 * 2026-10-07). The report advisory clears server-side when the report for its
 * week is actually displayed. In-app only: no push, no email (decision 46).
 */
export function RemindersBell() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const reminders = useQuery<RemindersResponse>({
    queryKey: queryKeys.reminders,
    queryFn: () => apiGet<RemindersResponse>('/api/reminders'),
  })
  const items = reminders.data?.items ?? []
  const count = items.length

  const runAction = (path: string) => {
    setOpen(false)
    navigate(path)
  }

  return (
    <>
      <button
        type="button"
        data-testid="reminders-bell"
        aria-label={count > 0 ? `Reminders, ${count} need attention` : 'Reminders'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="relative flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-white/60 px-2 py-1 text-white hover:bg-white/15"
      >
        <span aria-hidden className="text-lg leading-none">
          🔔
        </span>
        {count > 0 && (
          <span
            data-testid="reminders-badge"
            aria-hidden
            className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs font-semibold text-white"
          >
            {count}
          </span>
        )}
      </button>

      {open && (
        <Modal open title="Reminders" onClose={() => setOpen(false)}>
          {count === 0 ? (
            <p data-testid="reminders-all-clear" className="m-0 py-2 text-sm text-ink-light">
              All caught up — nothing needs your attention.
            </p>
          ) : (
            <ul data-testid="reminders-list" className="m-0 flex list-none flex-col gap-3 p-0">
              {items.map((item) => (
                <li key={item.type} data-testid={`reminder-${item.type}`} className="flex flex-col gap-1.5">
                  <div>
                    <p className="m-0 text-sm font-semibold">{reminderTitle(item)}</p>
                    <p className="m-0 text-xs text-ink-light">{reminderDetail(item)}</p>
                  </div>
                  <button
                    type="button"
                    data-testid={`reminder-action-${item.type}`}
                    onClick={() => runAction(reminderActionPath(item))}
                    className="min-h-11 self-start rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                  >
                    {reminderActionLabel(item)}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex justify-end border-t border-line-light pt-3">
            <button
              type="button"
              data-testid="reminders-close"
              onClick={() => setOpen(false)}
              className="min-h-11 rounded-full border border-line px-4 py-2 text-sm font-medium hover:bg-bg"
            >
              Close
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
