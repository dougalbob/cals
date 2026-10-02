import { useState } from 'react'
import type { Drink } from '../api/types'
import { formatNumber } from '../lib/format'
import { WaterGlass } from './WaterGlass'

/**
 * Picks the drink used for the one-tap glass: the user's drink literally named
 * "Water" if they have one, otherwise the first water-counting drink. Users may
 * flag several drinks (tea, squash, coffee) — the glass should still be water.
 */
export function pickWaterDrink(drinks: Drink[]): Drink | null {
  const named = drinks.find((drink) => drink.name.trim().toLowerCase() === 'water')
  return named ?? drinks[0] ?? null
}

/**
 * The water target: measured from water-counting drink entries (one source of
 * truth), never a separate water ledger. A standard glass is the user's own
 * water drink, so the volume is theirs, not a hard-coded 250 ml.
 *
 * The glass reads as a **countdown**: full at the start of the day, drained
 * when the target is met. The logged total is still shown as consumed / target.
 */
export function WaterCard({
  consumedMl,
  targetMl,
  waterDrink,
  onAdd,
  pending,
  error,
}: {
  consumedMl: number
  targetMl: number
  /** The user's first water-counting drink, if they have one. */
  waterDrink: Drink | null
  onAdd: (volumeMl?: number) => void
  pending: boolean
  error: string | null
}) {
  const [showOther, setShowOther] = useState(false)
  const [otherMl, setOtherMl] = useState(500)

  const addOther = () => {
    if (otherMl > 0) {
      onAdd(otherMl)
      setShowOther(false)
    }
  }

  const glass = waterDrink?.volume_ml ?? 250
  const remaining = Math.max(0, targetMl - consumedMl)
  const done = targetMl > 0 && consumedMl >= targetMl
  const level = targetMl > 0 ? Math.max(0, Math.min(1, remaining / targetMl)) : 0

  return (
    <section className="rounded-2xl bg-card p-4 shadow-card" aria-label="Water">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="m-0 text-base font-semibold">💧 Water</h2>
        <span className="text-sm tabular-nums">
          <span className="font-semibold">{formatNumber(consumedMl)}</span>
          <span className="text-ink-light"> / {formatNumber(targetMl)} ml</span>
        </span>
      </div>

      <div className="mt-3 flex items-center gap-4">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={targetMl}
          aria-valuenow={Math.min(consumedMl, targetMl)}
          aria-label="Water towards target"
          className="shrink-0"
        >
          <WaterGlass level={level} label={`Water remaining: ${formatNumber(remaining)} ml of ${formatNumber(targetMl)} ml`} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="m-0 text-sm">
            {done ? (
              <span className="font-medium text-success">Target reached 🎉</span>
            ) : (
              <>
                <span className="text-xl font-semibold tabular-nums">{formatNumber(remaining)}</span>{' '}
                <span className="text-ink-light">ml to go</span>
              </>
            )}
          </p>
          <p className="m-0 mt-1 text-xs text-ink-light">
            {waterDrink ? `counted from your “${waterDrink.name}” drink` : 'no water-counting drink yet'}
          </p>

          {waterDrink ? (
            <div className="mt-3 flex flex-wrap items-stretch gap-2">
              <button
                type="button"
                onClick={() => onAdd()}
                disabled={pending}
                className="flex-1 min-w-[8rem] min-h-12 rounded-xl bg-primary-light/20 text-primary-dark font-medium border-0 cursor-pointer disabled:opacity-50"
              >
                {pending ? 'Adding…' : `+ ${formatNumber(glass)} ml`}
              </button>
              <button
                type="button"
                onClick={() => setShowOther((v) => !v)}
                aria-expanded={showOther}
                className="min-h-12 rounded-xl border border-line bg-surface px-4 cursor-pointer"
              >
                Other amount
              </button>
            </div>
          ) : (
            <p className="m-0 mt-2 text-sm text-ink-muted">
              Create a “Water” drink (or mark any drink as counting towards water) and the glass will
              show it — the target then measures exactly what you log.
            </p>
          )}
        </div>
      </div>

      {waterDrink && showOther && (
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            addOther()
          }}
        >
          <label className="text-sm text-ink-light" htmlFor="water-amount">
            Amount (ml)
            <input
              id="water-amount"
              type="number"
              min={1}
              step={50}
              value={otherMl}
              onChange={(event) => setOtherMl(Number(event.target.value))}
              className="mt-1 block w-28 min-h-11 rounded-xl border border-line px-3 text-base"
            />
          </label>
          <button
            type="button"
            onClick={addOther}
            disabled={pending || otherMl <= 0}
            className="min-h-11 rounded-xl bg-primary-light/20 text-primary-dark font-medium border-0 px-4 cursor-pointer disabled:opacity-50"
          >
            Add
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="m-0 mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  )
}
