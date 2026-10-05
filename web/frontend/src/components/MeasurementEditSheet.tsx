import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiPut, queryKeys } from '../api/client'
import type { MeasurementEntry, MeasurementPartKey } from '../api/types'
import { Modal } from './Modal'
import { formatLongDate } from '../lib/format'
import { MEASUREMENT_PARTS, round1 } from '../lib/measurements'

/**
 * Correct a recorded session (decision 96's PUT path): the row keeps its own
 * date and identity, each part edits independently, and a blanked field clears
 * that part. Deleting the whole session uses the low-friction inline two-step
 * confirmation from decision 86.
 */
export function MeasurementEditSheet({ entry, onClose }: { entry: MeasurementEntry; onClose: () => void }) {
  const [values, setValues] = useState<Record<MeasurementPartKey, string>>(() => {
    const initial = {} as Record<MeasurementPartKey, string>
    for (const part of MEASUREMENT_PARTS) {
      const recorded = entry[part.key]
      initial[part.key] = recorded === null ? '' : String(round1(recorded))
    }
    return initial
  })
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const parsed = MEASUREMENT_PARTS.map((part) => {
    const raw = values[part.key].trim()
    return { part, raw, value: raw === '' ? null : Number(raw) }
  })
  const invalid = parsed.find(({ raw, value }) => raw !== '' && (!Number.isFinite(value) || (value ?? 0) <= 0))
  const anyValue = parsed.some(({ value }) => value !== null && Number.isFinite(value) && value > 0)
  const changed = parsed.some(({ part, raw }) => {
    const recorded = entry[part.key]
    if (raw === '') return recorded !== null
    return recorded === null || round1(Number(raw)) !== round1(recorded)
  })

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, number | null> = {}
      for (const { part, value } of parsed) {
        body[part.key] = value === null || !Number.isFinite(value) ? null : round1(value)
      }
      return apiPut<MeasurementEntry>(`/api/measurements/${entry.id}`, body)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.measurements })
      onClose()
    },
    onError: () => setError('Could not save the changes. Please try again.'),
  })

  const remove = useMutation({
    mutationFn: () => apiDelete(`/api/measurements/${entry.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.measurements })
      onClose()
    },
    onError: () => setError('Could not delete the entry. Please try again.'),
  })

  const footer = confirmingDelete ? (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => setConfirmingDelete(false)}
        className="min-h-11 flex-1 cursor-pointer rounded-xl border border-line bg-card text-sm font-semibold text-ink"
      >
        Cancel
      </button>
      <button
        type="button"
        data-testid="confirm-delete-entry"
        onClick={() => remove.mutate()}
        disabled={remove.isPending}
        className="min-h-11 flex-1 cursor-pointer rounded-xl bg-danger text-sm font-semibold text-white disabled:opacity-60"
      >
        Delete session
      </button>
    </div>
  ) : (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onClose}
        className="min-h-11 flex-1 cursor-pointer rounded-xl border border-line bg-card text-sm font-semibold text-ink"
      >
        Cancel
      </button>
      <button
        type="button"
        data-testid="save-entry-changes"
        onClick={() => {
          setError(null)
          save.mutate()
        }}
        disabled={!anyValue || Boolean(invalid) || !changed || save.isPending}
        className="min-h-11 flex-1 cursor-pointer rounded-xl bg-primary text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        Save changes
      </button>
    </div>
  )

  return (
    <Modal open title={`Edit ${formatLongDate(entry.date)}`} onClose={onClose} footer={footer}>
      <div className="flex flex-col gap-3">
        <p className="m-0 text-xs text-ink-muted">
          Corrections keep this date — to record today's measurements, use the body map above. Blank a
          field to remove that part from this session.
        </p>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {MEASUREMENT_PARTS.map(({ key, label }) => (
            <label key={key} className="flex flex-col gap-1 text-xs font-medium text-ink-light">
              {label}
              <input
                type="number"
                inputMode="decimal"
                step={0.1}
                min={0}
                value={values[key]}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [key]: event.target.value }))
                }
                aria-label={`${label} in centimetres`}
                placeholder="—"
                className="w-full rounded-lg border border-line bg-card px-2.5 py-2 text-sm text-ink tabular-nums"
              />
            </label>
          ))}
        </div>

        {invalid && (
          <p role="alert" className="m-0 text-xs text-danger">
            {invalid.part.label} must be a number greater than zero, or blank.
          </p>
        )}
        {error && (
          <p role="alert" className="m-0 text-xs text-danger">
            {error}
          </p>
        )}

        <div className="border-t border-line-light pt-3">
          {confirmingDelete ? (
            <p data-testid="delete-confirm-text" className="m-0 text-sm text-ink">
              Delete this whole measurement session? This cannot be undone.
            </p>
          ) : (
            <button
              type="button"
              data-testid="delete-entry"
              onClick={() => setConfirmingDelete(true)}
              className="min-h-11 cursor-pointer border-0 bg-transparent px-0 text-sm font-medium text-danger"
            >
              Delete this session…
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
