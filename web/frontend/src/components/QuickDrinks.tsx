import { useEffect, useRef, useState, type UIEvent } from 'react'
import { Link } from 'react-router'
import type { Drink, DrinkEntry } from '../api/types'
import { chunkRows, drinkExtras, isWaterDrink, sugarLabel, varyCalories, type SugarAmount } from '../lib/drinkCatalog'
import { formatNumber } from '../lib/format'
import { Modal } from './Modal'

/**
 * Keeps everyday choices (Tea, Coffee) first when present. Water is not a
 * quick-drink — it lives on the glass.
 */
const EVERYDAY_ORDER = ['tea', 'coffee']

export function orderQuickDrinks(drinks: Drink[]): Drink[] {
  const rank = (drink: Drink) => {
    const name = drink.name.trim().toLowerCase()
    const everyday = EVERYDAY_ORDER.indexOf(name)
    if (everyday !== -1) return everyday
    if (drink.counts_toward_water) return EVERYDAY_ORDER.length
    return EVERYDAY_ORDER.length + 1
  }

  return [...drinks].sort((a, b) => {
    const ao = a.sort_order ?? 0
    const bo = b.sort_order ?? 0
    if (ao !== 0 || bo !== 0) {
      if (ao !== bo) return ao - bo
    }
    return rank(a) - rank(b) || a.name.localeCompare(b.name) || a.id - b.id
  })
}

/** The 2×2 grid never includes Water — the glass is that button. */
export function quickDrinksForGrid(drinks: Drink[]): Drink[] {
  return orderQuickDrinks(drinks.filter((drink) => !isWaterDrink(drink)))
}

/**
 * Counts how many of each drink definition have been logged on the active day,
 * and tracks the most recently logged entry ID for deletion.
 */
export function countDrinkEntries(
  drinks: Drink[],
  entries: DrinkEntry[],
): Map<number, { count: number; latestEntryId: number | null }> {
  const counts = new Map<number, { count: number; latestEntryId: number | null }>()
  for (const d of drinks) {
    counts.set(d.id, { count: 0, latestEntryId: null })
  }

  for (const entry of entries) {
    const existing = counts.get(entry.drink_id)
    if (existing) {
      existing.count += 1
      existing.latestEntryId = Math.max(existing.latestEntryId ?? 0, entry.id)
    } else {
      counts.set(entry.drink_id, { count: 1, latestEntryId: entry.id })
    }
  }
  return counts
}

export function QuickDrinks({
  drinks,
  entries = [],
  onAdd,
  onDeleteLatest,
  pendingDrinkId,
  deletingEntryId = null,
  error,
}: {
  drinks: Drink[]
  entries?: DrinkEntry[]
  onAdd: (drink: Drink, opts?: { volumeMl?: number; calories?: number }) => void
  onDeleteLatest?: (entryId: number, drinkName: string) => void
  /** The drink currently being logged, so only its chip shows a pending state. */
  pendingDrinkId: number | null
  deletingEntryId?: number | null
  error: string | null
}) {
  const ordered = quickDrinksForGrid(drinks)
  const stats = countDrinkEntries(drinks, entries)
  const rows = chunkRows(ordered, 2)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPressRef = useRef(false)
  const lastSnapRow = useRef(0)
  const [activePressId, setActivePressId] = useState<number | null>(null)
  const [varyDrink, setVaryDrink] = useState<Drink | null>(null)

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
    setActivePressId(null)
  }

  const startPress = (drink: Drink, latestEntryId: number | null) => {
    clearTimer()
    didLongPressRef.current = false
    if (!latestEntryId || !onDeleteLatest) return
    setActivePressId(drink.id)
    timerRef.current = setTimeout(() => {
      didLongPressRef.current = true
      setActivePressId(null)
      haptic(40)
      onDeleteLatest(latestEntryId, drink.name)
    }, 550)
  }

  const handleClick = (drink: Drink) => {
    if (didLongPressRef.current) {
      didLongPressRef.current = false
      return
    }
    onAdd(drink)
  }

  const handleSnapScroll = (event: UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget
    const rowHeight = el.firstElementChild instanceof HTMLElement ? el.firstElementChild.offsetHeight : 0
    if (rowHeight <= 0) return
    const row = Math.round(el.scrollTop / (rowHeight + 8))
    if (row !== lastSnapRow.current) {
      lastSnapRow.current = row
      haptic(10)
    }
  }

  return (
    <div className="flex flex-col" aria-label="Quick drinks">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="m-0 text-sm font-semibold">🥤 Quick drinks</h3>
        <Link
          to="/drinks"
          className="text-[0.7rem] font-medium text-primary-dark no-underline hover:underline"
        >
          My drinks
        </Link>
      </div>
      <p className="m-0 mt-0.5 text-[0.65rem] text-ink-muted">Tap to add · long press to delete</p>

      {ordered.length === 0 ? (
        <p className="m-0 mt-2 text-xs text-ink-muted">
          Nothing on the card yet.{' '}
          <Link to="/drinks" className="font-medium text-primary-dark">
            Choose your drinks
          </Link>
        </p>
      ) : (
        <div
          className="mt-2 max-h-[7.35rem] overflow-y-auto overscroll-contain snap-y snap-mandatory [scrollbar-width:thin]"
          onScroll={rows.length > 2 ? handleSnapScroll : undefined}
        >
          <ul className="list-none m-0 p-0 flex flex-col gap-2">
            {rows.map((row, rowIndex) => (
              <li key={row.map((d) => d.id).join('-')} className="snap-start grid grid-cols-2 gap-2">
                {row.map((drink) => {
                  const pending = pendingDrinkId === drink.id
                  const drinkStat = stats.get(drink.id)
                  const count = drinkStat?.count ?? 0
                  const latestEntryId = drinkStat?.latestEntryId ?? null
                  const isDeleting = latestEntryId !== null && deletingEntryId === latestEntryId
                  const isHolding = activePressId === drink.id
                  const extras = drinkExtras(drink)
                  const canVary = extras.acceptsMilk || extras.acceptsSugar

                  return (
                    <div key={drink.id} className={rowIndex === 0 && row.length === 1 ? 'col-span-1' : ''}>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => handleClick(drink)}
                          onPointerDown={(e) => {
                            if (e.button === 0) startPress(drink, latestEntryId)
                          }}
                          onPointerUp={clearTimer}
                          onPointerLeave={clearTimer}
                          onPointerCancel={clearTimer}
                          onContextMenu={(e) => {
                            if (count > 0 && onDeleteLatest) e.preventDefault()
                          }}
                          disabled={pendingDrinkId !== null || deletingEntryId !== null}
                          aria-label={`Add ${drink.name}${count > 0 ? `, ${count} logged today` : ''}`}
                          className={[
                            'relative w-full flex items-center gap-1.5 min-h-[3.35rem] rounded-xl border border-line bg-surface px-2.5 py-1.5 text-left cursor-pointer transition-all select-none',
                            'disabled:opacity-50 active:scale-[0.98]',
                            isHolding ? 'scale-95 bg-danger/10 border-danger/40 ring-2 ring-danger/30' : '',
                          ].join(' ')}
                        >
                          <span aria-hidden className="text-lg leading-none shrink-0">
                            {drink.icon || '🥤'}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1 text-xs font-medium">
                              <span className="truncate">{drink.name}</span>
                              <span
                                className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-primary text-white text-[0.65rem] font-bold tabular-nums"
                                title={`${count} logged today`}
                              >
                                {count}
                              </span>
                            </span>
                            <span className="block text-[0.65rem] text-ink-light tabular-nums truncate">
                              {drink.volume_ml} ml · {formatNumber(drink.calories)} kcal
                            </span>
                          </span>
                          {(pending || isDeleting) && (
                            <span className="text-[0.65rem] text-ink-light shrink-0">
                              {isDeleting ? '…' : '…'}
                            </span>
                          )}
                        </button>
                        {canVary && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              setVaryDrink(drink)
                            }}
                            disabled={pendingDrinkId !== null || deletingEntryId !== null}
                            aria-label={`Change milk or sugar for this ${drink.name}`}
                            className="absolute top-0.5 right-0.5 min-h-7 min-w-7 rounded-lg border-0 bg-transparent text-ink-light text-base leading-none cursor-pointer hover:text-ink disabled:opacity-40"
                          >
                            ···
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p role="alert" className="m-0 mt-2 text-xs text-danger">
          {error}
        </p>
      )}

      {varyDrink && (
        <VaryDrinkSheet
          key={varyDrink.id}
          drink={varyDrink}
          onClose={() => setVaryDrink(null)}
          onAdd={(drink, calories) => {
            onAdd(drink, { calories })
            setVaryDrink(null)
          }}
          pending={pendingDrinkId !== null}
        />
      )}
    </div>
  )
}

function haptic(ms: number) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(ms)
    } catch {
      // ignore
    }
  }
}

function VaryDrinkSheet({
  drink,
  onClose,
  onAdd,
  pending,
}: {
  drink: Drink
  onClose: () => void
  onAdd: (drink: Drink, calories: number) => void
  pending: boolean
}) {
  const extras = drinkExtras(drink)
  const [milk, setMilk] = useState(extras.usualMilk)
  const [sugar, setSugar] = useState<SugarAmount>(extras.usualSugar)
  const calories = varyCalories(drink, milk, sugar)

  return (
    <Modal open title={drink.name} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="m-0 text-sm text-ink-light">
          For this drink only — your usual stays {extras.usualMilk ? 'with milk' : 'no milk'},{' '}
          {sugarLabel(extras.usualSugar).toLowerCase()}.
        </p>

        {extras.acceptsMilk && (
          <fieldset className="m-0 p-0 border-0">
            <legend className="text-xs font-semibold text-ink-light mb-1.5">Milk</legend>
            <div className="grid grid-cols-2 gap-2">
              <Choice selected={!milk} onClick={() => setMilk(false)} label="None" />
              <Choice selected={milk} onClick={() => setMilk(true)} label="With milk" />
            </div>
          </fieldset>
        )}

        {extras.acceptsSugar && (
          <fieldset className="m-0 p-0 border-0">
            <legend className="text-xs font-semibold text-ink-light mb-1.5">Sugar</legend>
            <div className="grid grid-cols-4 gap-2">
              {(['0', '1', '2', 'sweetener'] as SugarAmount[]).map((value) => (
                <Choice
                  key={value}
                  selected={sugar === value}
                  onClick={() => setSugar(value)}
                  label={value === 'sweetener' ? 'Sweet' : value}
                />
              ))}
            </div>
          </fieldset>
        )}

        <p className="m-0 text-sm tabular-nums">
          <span className="font-semibold">{formatNumber(calories)}</span>{' '}
          <span className="text-ink-light">kcal · {drink.volume_ml} ml</span>
        </p>

        <button
          type="button"
          disabled={pending}
          onClick={() => onAdd(drink, calories)}
          className="min-h-11 rounded-xl bg-primary text-white text-sm font-medium border-0 cursor-pointer disabled:opacity-50"
        >
          Add {drink.name}
        </button>
      </div>
    </Modal>
  )
}

function Choice({
  selected,
  onClick,
  label,
}: {
  selected: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        'min-h-11 rounded-xl border text-sm font-medium cursor-pointer',
        selected ? 'bg-primary text-white border-primary' : 'bg-surface text-ink border-line',
      ].join(' ')}
    >
      {label}
    </button>
  )
}
