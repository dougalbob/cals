import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { Drink, DrinkEntry } from '../api/types'
import { isWaterDrink } from '../lib/drinkCatalog'
import { formatNumber } from '../lib/format'
import { QuickDrinks } from './QuickDrinks'
import { WaterGlass } from './WaterGlass'

/**
 * The glass logs Water only — never tea/squash, even if those count toward the
 * daily target. No Water drink means the glass is inert and points at My drinks.
 */
export function pickWaterDrink(drinks: Drink[]): Drink | null {
  return drinks.find((drink) => isWaterDrink(drink)) ?? null
}

/**
 * Merged Fluids & Drinks Card:
 * Left: tappable draining glass (unit of water) plus compact "+ other".
 * Right: equal-width 2×2 quick drinks, counters, long-press deletion.
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
  onAddDrink: (drink: Drink, opts?: { volumeMl?: number; calories?: number }) => void
  onDeleteDrinkEntry?: (entryId: number, drinkName: string) => void
  pendingDrinkId: number | null
  deletingEntryId?: number | null
  error: string | null
}) {
  const [showOther, setShowOther] = useState(false)
  const [otherMl, setOtherMl] = useState(250)
  const [holdingGlass, setHoldingGlass] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPressRef = useRef(false)

  const remaining = Math.max(0, targetMl - consumedMl)
  const done = targetMl > 0 && consumedMl >= targetMl
  const level = targetMl > 0 ? Math.max(0, Math.min(1, remaining / targetMl)) : 0

  const waterEntries = waterDrink ? entries.filter((entry) => entry.drink_id === waterDrink.id) : []
  const latestWaterId = waterEntries.reduce<number | null>(
    (max, entry) => (max === null || entry.id > max ? entry.id : max),
    null,
  )
  const busy = pendingDrinkId !== null || deletingEntryId !== null

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setHoldingGlass(false)
  }

  const startGlassPress = () => {
    clearTimer()
    didLongPressRef.current = false
    if (!latestWaterId || !onDeleteDrinkEntry || !waterDrink) return
    setHoldingGlass(true)
    timerRef.current = setTimeout(() => {
      didLongPressRef.current = true
      setHoldingGlass(false)
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(40)
        } catch {
          // ignore
        }
      }
      onDeleteDrinkEntry(latestWaterId, waterDrink.name)
    }, 550)
  }

  const handleAddGlass = () => {
    if (didLongPressRef.current) {
      didLongPressRef.current = false
      return
    }
    if (waterDrink) onAddDrink(waterDrink)
  }

  const handleAddOther = () => {
    if (otherMl > 0 && waterDrink) {
      onAddDrink(waterDrink, { volumeMl: otherMl })
      setShowOther(false)
    }
  }

  const glassLabel = waterDrink
    ? `Add a ${waterDrink.volume_ml} ml glass of water${waterEntries.length > 0 ? `, ${waterEntries.length} logged today` : ''}`
    : 'Set your glass size in My drinks'

  return (
    <section className="rounded-2xl bg-card p-4 shadow-card" aria-label="Fluids and drinks">
      <div className="flex flex-col md:flex-row items-stretch gap-4">
        <div className="flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="m-0 text-base font-semibold">💧 Water</h2>
              <span className="text-xs tabular-nums text-ink-light">
                <span className="font-semibold text-ink">{formatNumber(consumedMl)}</span> / {formatNumber(targetMl)} ml
              </span>
            </div>

            <div className="mt-3 flex items-center gap-3">
              {waterDrink ? (
                <button
                  type="button"
                  onClick={handleAddGlass}
                  onPointerDown={(e) => {
                    if (e.button === 0) startGlassPress()
                  }}
                  onPointerUp={clearTimer}
                  onPointerLeave={clearTimer}
                  onPointerCancel={clearTimer}
                  onContextMenu={(e) => {
                    if (latestWaterId) e.preventDefault()
                  }}
                  disabled={busy}
                  aria-label={glassLabel}
                  className={[
                    'shrink-0 rounded-xl border-0 bg-transparent p-0 cursor-pointer disabled:opacity-50 active:scale-95 transition-transform',
                    holdingGlass ? 'scale-95' : '',
                  ].join(' ')}
                >
                  <span
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={targetMl}
                    aria-valuenow={Math.min(consumedMl, targetMl)}
                    aria-label="Water towards target"
                    className="block"
                  >
                    <WaterGlass
                      level={level}
                      width={58}
                      height={84}
                      label={`Water remaining: ${formatNumber(remaining)} ml`}
                    />
                  </span>
                </button>
              ) : (
                <Link to="/drinks" aria-label={glassLabel} className="shrink-0 no-underline">
                  <span
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={targetMl}
                    aria-valuenow={Math.min(consumedMl, targetMl)}
                    aria-label="Water towards target"
                    className="block opacity-60"
                  >
                    <WaterGlass
                      level={1}
                      width={58}
                      height={84}
                      label="Set your glass size in My drinks"
                    />
                  </span>
                </Link>
              )}

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
                <p className="m-0 mt-0.5 text-[0.65rem] text-ink-muted">
                  {waterDrink ? 'Tap the glass to log one' : 'Set a glass size in My drinks'}
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
                  disabled={busy || otherMl <= 0}
                  className="min-h-8 rounded-xl bg-primary text-white text-xs font-medium border-0 px-3 cursor-pointer disabled:opacity-50"
                >
                  Add
                </button>
              </form>
            )}
          </div>
        </div>

        <div
          className="border-t border-line-light md:border-t-0 md:border-l md:border-line-light self-stretch my-1 md:my-0"
          aria-hidden="true"
        />

        <div className="flex-1 flex flex-col justify-start">
          <QuickDrinks
            drinks={drinks}
            entries={entries}
            onAdd={onAddDrink}
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
