import { useEffect, useRef, useState } from 'react'
import type { Drink, DrinkEntry } from '../api/types'
import { formatNumber } from '../lib/format'

/**
 * Keeps everyday choices (Water, Tea, Coffee) first when present.
 */
const EVERYDAY_ORDER = ['water', 'tea', 'coffee']

export function orderQuickDrinks(drinks: Drink[]): Drink[] {
  const rank = (drink: Drink) => {
    const name = drink.name.trim().toLowerCase()
    const everyday = EVERYDAY_ORDER.indexOf(name)
    if (everyday !== -1) return everyday
    if (drink.counts_toward_water) return EVERYDAY_ORDER.length
    return EVERYDAY_ORDER.length + 1
  }

  return [...drinks].sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name) || a.id - b.id,
  )
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
  onAdd: (drink: Drink) => void
  onDeleteLatest?: (entryId: number, drinkName: string) => void
  /** The drink currently being logged, so only its chip shows a pending state. */
  pendingDrinkId: number | null
  deletingEntryId?: number | null
  error: string | null
}) {
  const ordered = orderQuickDrinks(drinks)
  const stats = countDrinkEntries(drinks, entries)

  // Long press handling (550ms hold)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPressRef = useRef(false)
  const [activePressId, setActivePressId] = useState<number | null>(null)

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

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
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(40)
        } catch {
          // ignore
        }
      }
      onDeleteLatest(latestEntryId, drink.name)
    }, 550)
  }

  const handlePointerUpOrCancel = () => {
    clearTimer()
  }

  const handleClick = (drink: Drink) => {
    if (didLongPressRef.current) {
      didLongPressRef.current = false
      return
    }
    onAdd(drink)
  }

  return (
    <div className="flex flex-col" aria-label="Quick drinks">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="m-0 text-sm font-semibold">🥤 Quick drinks</h3>
        <span className="text-[0.7rem] text-ink-muted">Tap to add · long press to delete</span>
      </div>

      {ordered.length === 0 ? (
        <p className="m-0 mt-2 text-xs text-ink-muted">
          No drinks yet. Add your own drinks in Settings — the quick selector only shows your definitions.
        </p>
      ) : (
        <ul className="list-none m-0 mt-2 p-0 flex flex-wrap gap-2">
          {ordered.map((drink) => {
            const pending = pendingDrinkId === drink.id
            const drinkStat = stats.get(drink.id)
            const count = drinkStat?.count ?? 0
            const latestEntryId = drinkStat?.latestEntryId ?? null
            const isDeleting = latestEntryId !== null && deletingEntryId === latestEntryId
            const isHolding = activePressId === drink.id

            return (
              <li key={drink.id} className="relative">
                <button
                  type="button"
                  onClick={() => handleClick(drink)}
                  onPointerDown={(e) => { if (e.button === 0) startPress(drink, latestEntryId) }}
                  onPointerUp={handlePointerUpOrCancel}
                  onPointerLeave={handlePointerUpOrCancel}
                  onPointerCancel={handlePointerUpOrCancel}
                  onContextMenu={(e) => {
                    // Prevent context menu on mobile long-press
                    if (count > 0 && onDeleteLatest) e.preventDefault()
                  }}
                  disabled={pendingDrinkId !== null || deletingEntryId !== null}
                  aria-label={`Add ${drink.name}${count > 0 ? `, ${count} logged today` : ''}`}
                  className={[
                    'relative flex items-center gap-2 min-h-11 rounded-xl border border-line bg-surface px-3 py-1.5 text-left cursor-pointer transition-all select-none',
                    'disabled:opacity-50 active:scale-[0.98]',
                    isHolding ? 'scale-95 bg-danger/10 border-danger/40 ring-2 ring-danger/30' : '',
                  ].join(' ')}
                >
                  <span aria-hidden className="text-lg leading-none">
                    {drink.icon || '🥤'}
                  </span>
                  <span>
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      <span>{drink.name}</span>
                      {(
                        <span
                          className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-primary text-white text-[0.65rem] font-bold tabular-nums"
                          title={`${count} logged today`}
                        >
                          {count}
                        </span>
                      )}
                    </span>
                    <span className="block text-[0.68rem] text-ink-light tabular-nums">
                      {drink.volume_ml} ml · {formatNumber(drink.calories)} kcal
                    </span>
                  </span>
                  {(pending || isDeleting) && (
                    <span className="text-[0.68rem] text-ink-light">
                      {isDeleting ? 'deleting…' : 'adding…'}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {error && (
        <p role="alert" className="m-0 mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
