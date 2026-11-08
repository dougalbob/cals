import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiPost, queryKeys } from '../api/client'
import type { MeasurementPartKey, MeasurementPoint } from '../api/types'
import { Modal } from './Modal'
import { todayIso, formatShortDate } from '../lib/format'
import { labelFor, round1 } from '../lib/measurements'

/**
 * The body map's pop-up (decision 67): shows the last recorded value for one
 * part, which can be overtyped or stepped in 0.5 cm moves (decision 99), and
 * commits a measurement for today — merged into today's row server-side, so
 * the other parts of the day survive (decision 96).
 *
 * Both of decision 67's confirmations live here:
 *  - cancelling with an unsaved change asks before discarding,
 *  - saving an unchanged value asks "is this correct?".
 */

/** The stepper's move (decision 99). Typed values keep their own 0.1 cm precision. */
export const MEASUREMENT_STEP_CM = 0.5

export function MeasurementSheet({
  part,
  latest,
  onClose,
}: {
  part: MeasurementPartKey
  latest: MeasurementPoint | null
  onClose: () => void
}) {
  const label = labelFor(part)
  const initialText = latest ? String(round1(latest.value)) : ''
  const [value, setValue] = useState(initialText)
  const [stage, setStage] = useState<'edit' | 'confirm-discard' | 'confirm-unchanged'>('edit')
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const parsed = Number(value)
  const isValid = value.trim() !== '' && Number.isFinite(parsed) && parsed > 0
  const isDirty = value.trim() !== initialText
  // "Unchanged" means the committed number would equal the last recorded one.
  const isUnchanged = latest !== null && isValid && round1(parsed) === round1(latest.value)

  const delta = useMemo(() => {
    if (!latest || !isValid) return null
    return round1(parsed - latest.value)
  }, [latest, isValid, parsed])

  const save = useMutation({
    mutationFn: () => apiPost<{ id: number }>('/api/measurements', { date: todayIso(), [part]: round1(parsed) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.measurements })
      // The logged session may clear the measurements nag (decisions 121–122).
      void queryClient.invalidateQueries({ queryKey: queryKeys.reminders })
      onClose()
    },
    onError: () => setError('Could not save the measurement. Please try again.'),
  })

  function handleSave() {
    if (!isValid) return
    if (isUnchanged && stage !== 'confirm-unchanged') {
      setStage('confirm-unchanged')
      return
    }
    setError(null)
    save.mutate()
  }

  function handleCancel() {
    if (isDirty && stage === 'edit') {
      setStage('confirm-discard')
      return
    }
    onClose()
  }

  function step(move: number) {
    const base = isValid ? parsed : (latest?.value ?? 0)
    const next = round1(base + move * MEASUREMENT_STEP_CM)
    if (next <= 0) return
    setValue(String(next))
    if (stage !== 'edit') setStage('edit')
  }

  const footer =
    stage === 'confirm-discard' ? (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setStage('edit')}
          className="min-h-11 flex-1 cursor-pointer rounded-xl border border-line bg-card text-sm font-semibold text-ink"
        >
          Keep editing
        </button>
        <button
          type="button"
          data-testid="confirm-discard"
          onClick={onClose}
          className="min-h-11 flex-1 cursor-pointer rounded-xl bg-danger text-sm font-semibold text-white"
        >
          Discard
        </button>
      </div>
    ) : stage === 'confirm-unchanged' ? (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setStage('edit')}
          className="min-h-11 flex-1 cursor-pointer rounded-xl border border-line bg-card text-sm font-semibold text-ink"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="confirm-save-anyway"
          onClick={handleSave}
          disabled={save.isPending}
          className="min-h-11 flex-1 cursor-pointer rounded-xl bg-primary text-sm font-semibold text-white disabled:opacity-60"
        >
          Save anyway
        </button>
      </div>
    ) : (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleCancel}
          className="min-h-11 flex-1 cursor-pointer rounded-xl border border-line bg-card text-sm font-semibold text-ink"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="save-measurement"
          onClick={handleSave}
          disabled={!isValid || save.isPending}
          aria-label={`Save ${label} measurement`}
          className="min-h-11 flex-1 cursor-pointer rounded-xl bg-primary text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          💾 Save
        </button>
      </div>
    )

  return (
    <Modal open title={`${label} — record`} onClose={handleCancel} footer={footer}>
      {stage === 'confirm-discard' ? (
        <p data-testid="confirm-discard-text" className="m-0 text-sm text-ink">
          You have an unsaved measurement. Discard it?
        </p>
      ) : stage === 'confirm-unchanged' ? (
        <p data-testid="confirm-unchanged-text" className="m-0 text-sm text-ink">
          Measurement hasn't changed — is this correct?
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-line-light bg-surface px-3 py-2 text-sm text-ink-light">
            {latest ? (
              <>
                <p className="m-0" data-testid="latest-value">
                  Last {latest.value.toFixed(1)} cm · {formatShortDate(latest.date)}
                </p>
                {latest.previous && (
                  <p className="m-0 mt-0.5 text-xs text-ink-muted">
                    Was {latest.previous.value.toFixed(1)} cm on {formatShortDate(latest.previous.date)}
                  </p>
                )}
              </>
            ) : (
              <p className="m-0" data-testid="latest-value">
                No {label.toLowerCase()} measurement yet — this will be the first.
              </p>
            )}
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              data-testid="step-down"
              onClick={() => step(-1)}
              aria-label={`Decrease ${label} by ${MEASUREMENT_STEP_CM} cm`}
              className="h-12 w-12 shrink-0 cursor-pointer rounded-full border border-line bg-card text-xl font-semibold text-ink"
            >
              −
            </button>
            <div className="w-32">
              <input
                data-testid="measurement-input"
                type="number"
                inputMode="decimal"
                step={0.1}
                min={0}
                value={value}
                onChange={(event) => {
                  setValue(event.target.value)
                  setStage('edit')
                }}
                aria-label={`${label} in centimetres`}
                className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-center text-lg font-semibold text-ink tabular-nums"
              />
            </div>
            <button
              type="button"
              data-testid="step-up"
              onClick={() => step(1)}
              aria-label={`Increase ${label} by ${MEASUREMENT_STEP_CM} cm`}
              className="h-12 w-12 shrink-0 cursor-pointer rounded-full border border-line bg-card text-xl font-semibold text-ink"
            >
              +
            </button>
          </div>

          <p className="m-0 text-center text-xs text-ink-muted" data-testid="measurement-delta">
            {!isValid
              ? 'Steps move 0.5 cm at a time; you can also type a value.'
              : delta === null || delta === 0
                ? 'Same as the last measurement.'
                : `${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)} cm vs last`}
          </p>

          {error && (
            <p role="alert" className="m-0 text-center text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
