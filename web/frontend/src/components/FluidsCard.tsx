import { useState } from 'react'
import type { Drink, DrinkEntry } from '../api/types'
import { formatNumber } from '../lib/format'
import { QuickDrinks } from './QuickDrinks'
import { WaterGlass } from './WaterGlass'

/**
 * Picks the drink used for water calculations and glass defaults:
 * literal "Water" if exists, else first drink with counts_toward_water.
 */
export function pickWaterDrink(drinks: Drink[]): Drink | null {
  const named = drinks.find((drink) => drink.name.trim().toLowerCase() === 'water')
  return named ?? drinks[0] ?? null
}

/**
 * Merged Fluids & Drinks Card:
 * Left side: Water target & draining glass (with compact "+ other" input).
 * Right side (separated by etched divider): Quick drinks selector with counters
 * and long-press deletion.
 */
export function FluidsCard({
  consumedMl,
  targetMl,
  waterDrink,
  drinks,
  entries = [],
  onAddDrink,
  onDeleteDrinkEntry,
  pendingDrinkId,
  deletingEntryId = null,
  error,
}: {
  consumedMl: number
  targetMl: number
  waterDrink: Drink | null
  drinks: Drink[]
  entries?: DrinkEntry[]
  onAddDrink: (drink: Drink, volumeMl?: number) => void
  onDeleteDrinkEntry?: (entryId: number, drinkName: string) => void
  pendingDrinkId: number | null
  deletingEntryId?: number | null
  error: string | null
}) {
  const [showOther, setShowOther] = useState(false)
  const [otherMl, setOtherMl] = useState(250)

  const remaining = Math.max(0, targetMl - consumedMl)
  const done = targetMl > 0 && consumedMl >= targetMl
  const level = targetMl > 0 ? Math.max(0, Math.min(1, remaining / targetMl)) : 0

  const handleAddOther = () => {
    if (otherMl > 0 && waterDrink) {
      onAddDrink(waterDrink, otherMl)
      setShowOther(false)
    }
  }

  return (
    <section className="rounded-2xl bg-card p-4 shadow-card" aria-label="Fluids and drinks">
      <div className="flex flex-col md:flex-row items-stretch gap-4">
        {/* Left: Water display & draining glass */}
        <div className="flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="m-0 text-base font-semibold">💧 Water</h2>
              <span className="text-xs tabular-nums text-ink-light">
                <span className="font-semibold text-ink">{formatNumber(consumedMl)}</span> / {formatNumber(targetMl)} ml
              </span>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={targetMl}
                aria-valuenow={Math.min(consumedMl, targetMl)}
                aria-label="Water towards target"
                className="shrink-0"
              >
                <WaterGlass
                  level={level}
                  width={58}
                  height={84}
                  label={`Water remaining: ${formatNumber(remaining)} ml`}
                />
              </div>

              <div className="min-w-0 flex-1">
                <p className="m-0 text-sm">
                  {done ? (
                    <span className="font-medium text-success">Target reached 🎉</span>
                  ) : (
                    <>
                      <span className="text-lg font-semibold tabular-nums">{formatNumber(remaining)}</span>{' '}
                      <span className="text-xs text-ink-light">ml to go</span>
                    </>
                  )}
                </p>

                {waterDrink && (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowOther((v) => !v)}
                      aria-expanded={showOther}
                      className="text-xs font-medium text-ink-light bg-surface border border-line rounded-lg px-2.5 py-1 cursor-pointer hover:text-ink active:scale-95 transition-all"
                    >
                      {showOther ? 'Cancel' : '+ other amount'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {waterDrink && showOther && (
              <form
                className="mt-2.5 flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  handleAddOther()
                }}
              >
                <input
                  id="water-other-amount"
                  aria-label="Other water amount (ml)"
                  type="number"
                  min={1}
                  step={50}
                  value={otherMl}
                  onChange={(e) => setOtherMl(Number(e.target.value))}
                  className="w-24 min-h-8 rounded-lg border border-line px-2 text-xs tabular-nums"
                />
                <span className="text-xs text-ink-light">ml</span>
                <button
                  type="button"
                  onClick={handleAddOther}
                  disabled={pendingDrinkId !== null || otherMl <= 0}
                  className="min-h-8 rounded-lg bg-primary text-white text-xs font-medium border-0 px-3 cursor-pointer disabled:opacity-50"
                >
                  Add
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Etched divider: vertical on medium+ screens, horizontal on mobile */}
        <div
          className="border-t border-line-light md:border-t-0 md:border-l md:border-line-light self-stretch my-1 md:my-0"
          aria-hidden="true"
        />

        {/* Right: Quick Drinks with counters & hold-to-delete */}
        <div className="flex-1 flex flex-col justify-start">
          <QuickDrinks
            drinks={drinks}
            entries={entries}
            onAdd={(drink) => onAddDrink(drink)}
            onDeleteLatest={onDeleteDrinkEntry}
            pendingDrinkId={pendingDrinkId}
            deletingEntryId={deletingEntryId}
            error={error}
          />
        </div>
      </div>
    </section>
  )
}
