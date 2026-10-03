import { useMemo, useState } from 'react'
import {
  defaultServing,
  matchingServing,
  preferredQuantityMode,
  servingChoices,
  type FoodWithServings,
  type QuantityMode,
} from '../lib/foodServings'
import { formatGrams } from '../lib/format'

interface QuantityPickerProps {
  /** The food (or a logged entry's food metadata) supplying named measures. */
  food: FoodWithServings
  /** Raw gram text, owned by the caller so incomplete typing ("3.") survives. */
  value: string
  onValueChange: (value: string) => void
  /** The same text parsed to grams; NaN when the text is not a usable quantity. */
  grams: number
  /** Unique prefix so two pickers on one screen keep distinct input ids. */
  idPrefix: string
  /** Live quantity feedback, computed by the caller from its own snapshot. */
  preview?: string | null
  autoFocus?: boolean
}

/**
 * The serving / grams quantity control (owner decision 29).
 *
 * Starts in serving mode only when the food has a real gram-backed measure;
 * otherwise it starts in grams. Grams are always available, every choice is
 * converted through grams, and nothing is invented — a food with no measures
 * gets a plain gram input.
 */
export function QuantityPicker({
  food,
  value,
  onValueChange,
  grams,
  idPrefix,
  preview,
  autoFocus = false,
}: QuantityPickerProps) {
  const choices = useMemo(() => servingChoices(food), [food])
  const [mode, setMode] = useState<QuantityMode>(() => preferredQuantityMode(food))

  const effectiveMode: QuantityMode = choices.length === 0 ? 'grams' : mode
  const selected = matchingServing(choices, grams)
  const inputId = `${idPrefix}-grams`
  const previewId = `${idPrefix}-preview`

  const switchToServing = () => {
    setMode('serving')
    if (!matchingServing(choices, grams)) {
      const fallback = defaultServing(food)
      if (fallback) onValueChange(String(fallback.grams))
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {choices.length > 0 && (
        <div className="flex gap-1 rounded-xl bg-surface p-1" role="group" aria-label="Quantity mode">
          <button
            type="button"
            aria-pressed={effectiveMode === 'serving'}
            onClick={switchToServing}
            className={`min-h-10 flex-1 rounded-lg text-sm font-medium ${
              effectiveMode === 'serving' ? 'bg-card shadow-sm text-ink' : 'bg-transparent text-ink-light'
            }`}
          >
            Serving
          </button>
          <button
            type="button"
            aria-pressed={effectiveMode === 'grams'}
            onClick={() => setMode('grams')}
            className={`min-h-10 flex-1 rounded-lg text-sm font-medium ${
              effectiveMode === 'grams' ? 'bg-card shadow-sm text-ink' : 'bg-transparent text-ink-light'
            }`}
          >
            Grams
          </button>
        </div>
      )}

      {effectiveMode === 'serving' ? (
        choices.length <= 4 ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Serving">
            {choices.map((choice) => (
              <button
                key={choice.key}
                type="button"
                aria-pressed={selected?.key === choice.key}
                onClick={() => onValueChange(String(choice.grams))}
                className={`min-h-11 rounded-xl border px-3 text-sm ${
                  selected?.key === choice.key
                    ? 'border-primary bg-primary/10 font-semibold text-primary-dark'
                    : 'border-line bg-card text-ink'
                }`}
              >
                {choice.label}
                <span className="block text-xs font-normal text-ink-light">{formatGrams(choice.grams)}</span>
              </button>
            ))}
          </div>
        ) : (
          <label className="flex flex-col gap-1 text-sm font-medium" htmlFor={`${inputId}-serving`}>
            Serving
            <select
              id={`${inputId}-serving`}
              value={selected?.key ?? ''}
              onChange={(event) => {
                const choice = choices.find((item) => item.key === event.target.value)
                if (choice) onValueChange(String(choice.grams))
              }}
              className="min-h-11 rounded-xl border border-line bg-card px-3"
            >
              <option value="" disabled>
                Choose a serving
              </option>
              {choices.map((choice) => (
                <option key={choice.key} value={choice.key}>
                  {choice.label} ({formatGrams(choice.grams)})
                </option>
              ))}
            </select>
          </label>
        )
      ) : (
        <div className="flex items-center gap-2">
          <label className="text-sm text-ink-light" htmlFor={inputId}>
            Weight (grams)
          </label>
          <input
            id={inputId}
            type="number"
            inputMode="decimal"
            min={1}
            step={5}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            autoFocus={autoFocus}
            aria-describedby={preview ? previewId : undefined}
            className="w-28 min-h-11 rounded-xl border border-line px-3 text-base tabular-nums"
          />
          <span className="text-sm text-ink-light">g</span>
        </div>
      )}

      {preview && (
        <p id={previewId} aria-live="polite" className="m-0 text-sm tabular-nums text-ink">
          {preview}
        </p>
      )}
    </div>
  )
}
