import type { Drink } from '../api/types'
import { formatNumber } from '../lib/format'

/**
 * The familiar quick-add drink selector, backed entirely by the signed-in
 * user's own drink definitions. One tap logs the drink; nothing is hard-coded
 * except the ordering that keeps the everyday choices (Water, Tea, Coffee)
 * first when the user has them.
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

export function QuickDrinks({
  drinks,
  onAdd,
  pendingDrinkId,
  error,
}: {
  drinks: Drink[]
  onAdd: (drink: Drink) => void
  /** The drink currently being logged, so only its chip shows a pending state. */
  pendingDrinkId: number | null
  error: string | null
}) {
  const ordered = orderQuickDrinks(drinks)

  return (
    <section className="rounded-2xl bg-card p-4 shadow-card" aria-label="Quick drinks">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="m-0 text-base font-semibold">🥤 Quick drinks</h2>
        <span className="text-xs text-ink-light">One tap to log</span>
      </div>

      {ordered.length === 0 ? (
        <p className="m-0 mt-2 text-sm text-ink-muted">
          No drinks yet. Add your own drinks in Settings — the quick selector only ever shows
          your definitions and their values.
        </p>
      ) : (
        <ul className="list-none m-0 mt-3 p-0 flex flex-wrap gap-2">
          {ordered.map((drink) => {
            const pending = pendingDrinkId === drink.id
            return (
              <li key={drink.id}>
                <button
                  type="button"
                  onClick={() => onAdd(drink)}
                  disabled={pendingDrinkId !== null}
                  aria-label={`Add ${drink.name}${drink.calories > 0 ? `, ${drink.calories} kcal` : ''}`}
                  className="flex items-center gap-2 min-h-12 rounded-xl border border-line bg-surface px-3 py-2 text-left cursor-pointer disabled:opacity-50 active:scale-[0.98] transition-transform"
                >
                  <span aria-hidden className="text-xl leading-none">
                    {drink.icon || '🥤'}
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{drink.name}</span>
                    <span className="block text-xs text-ink-light tabular-nums">
                      {drink.volume_ml} ml · {formatNumber(drink.calories)} kcal
                    </span>
                  </span>
                  {pending && <span className="text-xs text-ink-light">adding…</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {error && (
        <p role="alert" className="m-0 mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  )
}
