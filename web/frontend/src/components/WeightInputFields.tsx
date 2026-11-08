import type { WeightInputValues, WeightUnit } from '../lib/weightInput'

/** Numeric fields shared by target-weight editing and weigh-in entry. */
export function WeightInputFields({
  unit,
  label,
  value,
  onChange,
  autoFocusFirst = false,
}: {
  unit: WeightUnit
  label: string
  value: WeightInputValues
  onChange: (value: WeightInputValues) => void
  autoFocusFirst?: boolean
}) {
  const inputClassName =
    'min-h-11 w-full rounded-lg border border-line bg-card px-3 py-2 text-base text-ink tabular-nums'

  if (unit === 'kg') {
    return (
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="sr-only">{label}</legend>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-light">
          Kilograms (kg)
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={300}
            step={0.1}
            value={value.kg}
            onChange={(event) => onChange({ ...value, kg: event.target.value })}
            aria-label={`${label} in kilograms`}
            className={inputClassName}
            autoFocus={autoFocusFirst}
          />
        </label>
      </fieldset>
    )
  }

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">{label}</legend>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-light">
          Stones
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={value.stones}
            onChange={(event) => onChange({ ...value, stones: event.target.value })}
            aria-label={`${label} in stones`}
            className={inputClassName}
            autoFocus={autoFocusFirst}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-light">
          Pounds (lb)
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={13.9}
            step={0.1}
            value={value.pounds}
            onChange={(event) => onChange({ ...value, pounds: event.target.value })}
            aria-label={`${label} in pounds`}
            className={inputClassName}
          />
        </label>
      </div>
    </fieldset>
  )
}
