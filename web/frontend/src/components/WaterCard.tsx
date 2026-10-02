import { useState } from 'react'
import type { Drink } from '../api/types'
import { formatNumber } from '../lib/format'

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
  const pct = targetMl > 0 ? Math.min(100, Math.round((consumedMl / targetMl) * 100)) : 0
  const remaining = Math.max(0, targetMl - consumedMl)

  return (
    <section className="rounded-2xl bg-card p-4 shadow-card" aria-label="Water">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="m-0 text-base font-semibold">💧 Water</h2>
        <span className="text-sm tabular-nums">
          <span className="font-semibold">{formatNumber(consumedMl)}</span>
          <span className="text-ink-light"> / {formatNumber(targetMl)} ml</span>
        </span>
      </div>

      <div
        className="mt-3 h-3 w-full rounded-full bg-line-light overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={targetMl}
        aria-valuenow={Math.min(consumedMl, targetMl)}
        aria-label="Water towards target"
      >
        <div
          className="h-full rounded-full bg-water transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="m-0 mt-2 text-xs text-ink-light">
        {consumedMl >= targetMl && targetMl > 0
          ? 'Target reached 🎉'
          : `${formatNumber(remaining)} ml to go`}
        {waterDrink ? ` · counted from your “${waterDrink.name}” drink` : ''}
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
        <p className="m-0 mt-3 text-sm text-ink-muted">
          No drink is set to count towards water yet. Create a “Water” drink (or mark any drink as
          water) and it will show up here — the target then measures exactly what you log.
        </p>
      )}

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
