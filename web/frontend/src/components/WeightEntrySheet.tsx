import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiPost, queryKeys } from '../api/client'
import type { WeightEntry } from '../api/types'
import { formatKg, formatShortDate, formatStonesPounds, todayIso } from '../lib/format'
import {
  emptyWeightInput,
  validateWeightInput,
  weightInputToKg,
  type WeightInputValues,
  type WeightUnit,
} from '../lib/weightInput'
import { Modal } from './Modal'
import { WeightInputFields } from './WeightInputFields'

/** A date-editable entry sheet for a new (or corrected same-day) weigh-in. */
export function WeightEntrySheet({
  unit,
  latest,
  onClose,
}: {
  unit: WeightUnit
  latest: WeightEntry | null
  onClose: () => void
}) {
  const [date, setDate] = useState(todayIso)
  const [value, setValue] = useState<WeightInputValues>(emptyWeightInput)
  const [validationError, setValidationError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const today = todayIso()

  const save = useMutation({
    mutationFn: ({ date: entryDate, weightKg }: { date: string; weightKg: number }) =>
      apiPost<WeightEntry>('/api/weight', { date: entryDate, weight_kg: weightKg }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.weightPrefix })
      void queryClient.invalidateQueries({ queryKey: queryKeys.nutritionPrefix })
      onClose()
    },
  })

  const unitDescription = unit === 'kg' ? 'kilograms' : 'stones and pounds'

  const submit = () => {
    if (!date) {
      setValidationError('Choose the date of the weigh-in.')
      return
    }
    if (date > today) {
      setValidationError('A weigh-in date cannot be in the future.')
      return
    }
    const error = validateWeightInput(value, unit)
    if (error) {
      setValidationError(error)
      return
    }
    const weightKg = weightInputToKg(value, unit)
    if (weightKg === null) {
      setValidationError('Enter a valid weight.')
      return
    }
    setValidationError(null)
    save.mutate({ date, weightKg })
  }

  return (
    <Modal
      open
      title="Add weigh-in"
      onClose={onClose}
      footer={
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
            data-testid="save-weigh-in"
            onClick={submit}
            disabled={save.isPending}
            className="min-h-11 flex-1 cursor-pointer rounded-xl bg-primary text-sm font-semibold text-white disabled:opacity-60"
          >
            {save.isPending ? 'Saving…' : 'Save weigh-in'}
          </button>
        </div>
      }
    >
      <div data-testid="weigh-in-sheet" className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-light">
          Date
          <input
            type="date"
            value={date}
            max={today}
            onChange={(event) => {
              setDate(event.target.value)
              setValidationError(null)
            }}
            aria-label="Weigh-in date"
            data-testid="weigh-in-date"
            className="min-h-11 w-full rounded-lg border border-line bg-card px-3 py-2 text-base text-ink"
          />
        </label>

        <div className="flex flex-col gap-2">
          <p className="m-0 text-xs text-ink-light">
            Enter your weight in {unitDescription}.
          </p>
          <WeightInputFields
            unit={unit}
            label="Weight"
            value={value}
            onChange={(next) => {
              setValue(next)
              setValidationError(null)
              save.reset()
            }}
          />
        </div>

        {latest && (
          <p className="m-0 rounded-xl border border-line-light bg-surface px-3 py-2 text-xs text-ink-light">
            Last weigh-in: {formatShortDate(latest.date)} · {unit === 'kg' ? formatKg(latest.weight_kg) : formatStonesPounds(latest.weight_kg)}
          </p>
        )}

        {validationError && (
          <p role="alert" className="m-0 text-sm text-danger">
            {validationError}
          </p>
        )}
        {save.error instanceof Error && (
          <p role="alert" className="m-0 text-sm text-danger">
            {save.error.message || 'Could not save this weigh-in. Please try again.'}
          </p>
        )}
      </div>
    </Modal>
  )
}
