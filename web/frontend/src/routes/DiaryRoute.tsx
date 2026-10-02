import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, queryKeys } from '../api/client'
import { addDrinkEntry, createDiaryEntry, deleteDiaryEntry, deleteDrinkEntry } from '../api/diary'
import { MEALS, type Drink, type Food, type Meal } from '../api/types'
import { CalorieRing } from '../components/CalorieRing'
import { QuickDrinks } from '../components/QuickDrinks'
import { WaterCard } from '../components/WaterCard'
import { useBank, useDiary, useDrinkDefinitions, useDrinkEntries, useWater } from '../hooks/useDiaryData'
import { Modal } from '../components/Modal'
import { useDebounced } from '../hooks/useDebounced'
import { addDays, formatGrams, formatNumber, todayIso } from '../lib/format'

const MEAL_ACCENT: Record<Meal, string> = {
  breakfast: 'border-l-meal-breakfast',
  lunch: 'border-l-meal-lunch',
  dinner: 'border-l-meal-dinner',
  snacks: 'border-l-meal-snacks',
}

export function DiaryRoute() {
  const { date: dateParam } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const today = todayIso()
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today

  const [addingTo, setAddingTo] = useState<Meal | null>(null)
  const [pendingDrink, setPendingDrink] = useState<number | null>(null)

  const diary = useDiary(date)
  const bank = useBank(date)
  const drinks = useDrinkEntries(date)
  const drinkDefinitions = useDrinkDefinitions()
  const water = useWater(date)

  /** A logged drink changes the diary totals, the water total and the bank. */
  const refreshDrinkData = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.drinks(date) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.water(date) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.bank(date) })
  }

  const deleteEntry = useMutation({
    mutationFn: deleteDiaryEntry,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.diary(date) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.bank(date) })
    },
  })

  const addEntry = useMutation({
    mutationFn: (payload: { meal: Meal; food_id: number; quantity_grams: number }) =>
      createDiaryEntry(date, payload),
    onSuccess: () => {
      setAddingTo(null)
      void queryClient.invalidateQueries({ queryKey: queryKeys.diary(date) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.bank(date) })
    },
  })

  const addDrink = useMutation({
    mutationFn: ({ drink, volumeMl }: { drink: Drink; volumeMl?: number }) =>
      addDrinkEntry(drink.id, date, volumeMl),
    onMutate: ({ drink }) => setPendingDrink(drink.id),
    onSettled: () => setPendingDrink(null),
    onSuccess: refreshDrinkData,
  })

  const removeDrink = useMutation({
    mutationFn: deleteDrinkEntry,
    onSuccess: refreshDrinkData,
  })

  const entries = diary.data?.entries ?? []
  const foodCalories = diary.data?.totals.calories ?? 0
  const drinkCalories = useMemo(
    () => (drinks.data ?? []).reduce((acc, entry) => acc + entry.calories, 0),
    [drinks.data],
  )
  const consumed = Math.round(foodCalories + drinkCalories)
  const available = bank.data?.today_available ?? 2000
  const bankBalance = bank.data?.bank_balance ?? 0

  const waterDrinks = useMemo(
    () => (drinkDefinitions.data ?? []).filter((drink) => drink.counts_toward_water),
    [drinkDefinitions.data],
  )
  const waterDrink = waterDrinks[0] ?? null

  const drinkSummary = useMemo(() => {
    const grouped = new Map<string, { name: string; icon: string; count: number; calories: number; ml: number }>()
    for (const entry of drinks.data ?? []) {
      const key = entry.name
      const current =
        grouped.get(key) ?? { name: entry.name, icon: entry.icon, count: 0, calories: 0, ml: 0 }
      current.count += 1
      current.calories += entry.calories
      current.ml += entry.volume_ml
      grouped.set(key, current)
    }
    return [...grouped.values()]
  }, [drinks.data])

  const go = (delta: number) => navigate(`/diary/${addDays(date, delta)}`)

  if (diary.isPending || bank.isPending) {
    return <p className="text-ink-light">Loading diary…</p>
  }

  if (diary.isError || bank.isError) {
    const message = (diary.error ?? bank.error) as Error
    return (
      <div className="rounded-xl bg-card p-4 shadow-card">
        <p className="font-medium text-danger m-0">Could not load the diary</p>
        <p className="text-sm text-ink-light mb-0">{message.message}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Date navigation ------------------------------------------------ */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => go(-1)}
          className="min-h-11 min-w-11 rounded-xl bg-card border border-line text-lg cursor-pointer"
          aria-label="Previous day"
        >
          ‹
        </button>
        <div className="text-center">
          <p className="m-0 font-semibold">
            {date === today ? 'Today' : new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })}
          </p>
          <p className="m-0 text-xs text-ink-light">
            {new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          className="min-h-11 min-w-11 rounded-xl bg-card border border-line text-lg cursor-pointer"
          aria-label="Next day"
        >
          ›
        </button>
      </div>

      {/* Ring + bank ---------------------------------------------------- */}
      <section className="rounded-2xl bg-card p-4 shadow-card flex flex-col sm:flex-row items-center gap-4">
        <CalorieRing consumed={consumed} available={available} goal={bank.data?.daily_goal ?? 0} />
        <div className="flex-1 w-full grid grid-cols-2 gap-3">
          <Tile label="Daily goal" value={formatNumber(bank.data?.daily_goal ?? 0)} unit="kcal" />
          <Tile
            label={bankBalance >= 0 ? 'Banked' : 'Deficit'}
            value={`${bankBalance >= 0 ? '+' : ''}${formatNumber(bankBalance)}`}
            unit="kcal"
            tone={bankBalance >= 0 ? 'success' : 'danger'}
          />
          <Tile label="Food" value={formatNumber(foodCalories)} unit="kcal" />
          <Tile
            label="Drinks"
            value={formatNumber(drinkCalories)}
            unit="kcal"
            hint="counts towards the bank"
          />
        </div>
      </section>

      {/* Quick drinks — the familiar one-tap selector -------------------- */}
      <QuickDrinks
        drinks={drinkDefinitions.data ?? []}
        pendingDrinkId={pendingDrink}
        error={addDrink.isError ? (addDrink.error as Error).message : null}
        onAdd={(drink) => addDrink.mutate({ drink })}
      />

      {/* Water target — measured from the water-counting drinks above ----- */}
      <WaterCard
        consumedMl={water.data?.consumed_ml ?? 0}
        targetMl={water.data?.target_ml ?? 2000}
        waterDrink={waterDrink}
        pending={addDrink.isPending}
        error={water.isError ? (water.error as Error).message : null}
        onAdd={(volumeMl) => {
          if (waterDrink) addDrink.mutate({ drink: waterDrink, volumeMl })
        }}
      />

      {/* Meals ---------------------------------------------------------- */}
      {MEALS.map((meal) => {
        const mealEntries = entries.filter((entry) => entry.meal === meal.id)
        const mealCalories = mealEntries.reduce((acc, entry) => acc + entry.calories, 0)
        return (
          <section key={meal.id} className={`rounded-2xl bg-card shadow-card border-l-4 ${MEAL_ACCENT[meal.id]}`}>
            <header className="flex items-center justify-between px-4 pt-3">
              <h2 className="m-0 text-base font-semibold">
                <span aria-hidden className="mr-1.5">
                  {meal.icon}
                </span>
                {meal.label}
              </h2>
              <span className="text-sm text-ink-light tabular-nums">{formatNumber(mealCalories)} kcal</span>
            </header>

            <ul className="list-none m-0 p-0 px-4 pb-1">
              {mealEntries.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 py-2 border-b border-line-light last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="m-0 truncate text-sm font-medium">{entry.food_name || entry.recipe_name}</p>
                    <p className="m-0 text-xs text-ink-light">
                      {formatGrams(entry.quantity_grams)} · {formatNumber(entry.calories)} kcal
                      {entry.recipe_id ? ' · recipe' : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteEntry.mutate(entry.id)}
                    disabled={deleteEntry.isPending}
                    className="min-h-9 min-w-9 rounded-lg bg-transparent border border-line text-ink-light cursor-pointer disabled:opacity-40"
                    aria-label={`Delete ${entry.food_name || entry.recipe_name}`}
                  >
                    🗑
                  </button>
                </li>
              ))}
              {mealEntries.length === 0 && <li className="py-2 text-sm text-ink-muted">Nothing logged yet</li>}
            </ul>

            <div className="px-4 pb-3">
              <button
                type="button"
                onClick={() => setAddingTo(meal.id)}
                className="w-full min-h-10 rounded-xl bg-primary-light/15 text-primary-dark font-medium border-0 cursor-pointer"
              >
                + Add food
              </button>
            </div>
          </section>
        )
      })}

      {/* Drinks log (removable, so a mistap is easy to fix) --------------- */}
      <section className="rounded-2xl bg-card p-4 shadow-card">
        <h2 className="m-0 mb-2 text-base font-semibold">Drinks logged</h2>
        {drinkSummary.length === 0 ? (
          <p className="m-0 text-sm text-ink-muted">Nothing logged yet</p>
        ) : (
          <ul className="list-none m-0 p-0">
            {(drinks.data ?? []).map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-3 py-2 border-b border-line-light last:border-0"
              >
                <span aria-hidden className="text-lg">
                  {entry.icon || '🥤'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="m-0 truncate text-sm font-medium">{entry.name}</p>
                  <p className="m-0 text-xs text-ink-light tabular-nums">
                    {entry.volume_ml} ml · {formatNumber(entry.calories)} kcal
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeDrink.mutate(entry.id)}
                  disabled={removeDrink.isPending}
                  className="min-h-9 min-w-9 rounded-lg bg-transparent border border-line text-ink-light cursor-pointer disabled:opacity-40"
                  aria-label={`Delete ${entry.name}`}
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>
        )}
        {removeDrink.isError && (
          <p role="alert" className="m-0 mt-2 text-sm text-danger">
            {(removeDrink.error as Error).message}
          </p>
        )}
      </section>

      <AddFoodModal
        meal={addingTo}
        onClose={() => setAddingTo(null)}
        onAdd={(food, grams) => addEntry.mutate({ meal: addingTo as Meal, food_id: Number(food.id), quantity_grams: grams })}
        saving={addEntry.isPending}
        error={addEntry.isError ? (addEntry.error as Error).message : null}
      />
    </div>
  )
}

function Tile({
  label,
  value,
  unit,
  tone,
  hint,
}: {
  label: string
  value: string
  unit: string
  tone?: 'success' | 'danger'
  hint?: string
}) {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-ink'
  return (
    <div className="rounded-xl border border-line-light px-3 py-2">
      <p className="m-0 text-xs text-ink-light">{label}</p>
      <p className={`m-0 font-semibold tabular-nums ${toneClass}`}>
        {value} <span className="text-xs font-normal text-ink-light">{unit}</span>
      </p>
      {hint && <p className="m-0 text-[0.65rem] text-ink-muted">{hint}</p>}
    </div>
  )
}

function AddFoodModal({
  meal,
  onClose,
  onAdd,
  saving,
  error,
}: {
  meal: Meal | null
  onClose: () => void
  onAdd: (food: Food, grams: number) => void
  saving: boolean
  error: string | null
}) {
  const [term, setTerm] = useState('')
  const [grams, setGrams] = useState(100)
  const debounced = useDebounced(term, 250)

  const results = useQuery<Food[]>({
    queryKey: queryKeys.foodSearch(debounced),
    queryFn: () => apiGet<Food[]>(`/api/foods/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.trim().length >= 2,
  })

  const label = MEALS.find((m) => m.id === meal)?.label ?? ''

  return (
    <Modal open={meal !== null} title={`Add to ${label}`} onClose={onClose}>
      <input
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Search foods…"
        autoFocus
        className="w-full min-h-11 rounded-xl border border-line px-3 mb-3 text-base"
      />

      <label className="block text-sm text-ink-light mb-1" htmlFor="grams">
        Quantity (grams)
      </label>
      <input
        id="grams"
        type="number"
        min={1}
        step={5}
        value={grams}
        onChange={(event) => setGrams(Number(event.target.value))}
        className="w-28 min-h-11 rounded-xl border border-line px-3 mb-3 text-base"
      />

      {error && <p className="text-sm text-danger">{error}</p>}

      {results.isFetching && <p className="text-sm text-ink-light m-0">Searching…</p>}

      <ul className="list-none m-0 p-0">
        {(results.data ?? []).map((food) => (
          <li key={String(food.id)} className="border-b border-line-light last:border-0">
            <button
              type="button"
              disabled={saving || typeof food.id === 'string'}
              onClick={() => onAdd(food, grams)}
              className="w-full text-left bg-transparent border-0 py-2.5 min-h-11 cursor-pointer disabled:opacity-40"
              title={typeof food.id === 'string' ? 'FatSecret results are read-only in the spike' : undefined}
            >
              <span className="block text-sm font-medium">
                {food.name}
                {food.brand ? <span className="text-ink-light font-normal"> · {food.brand}</span> : null}
              </span>
              <span className="block text-xs text-ink-light">
                {formatNumber(Math.round((food.calories_per_100g * grams) / 100))} kcal for {grams} g
                {food.serving_name ? ` · ${food.serving_name}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {debounced.trim().length >= 2 && !results.isFetching && (results.data ?? []).length === 0 && (
        <p className="text-sm text-ink-muted">No matches.</p>
      )}
      {debounced.trim().length < 2 && <p className="text-sm text-ink-muted">Type at least 2 characters.</p>}
    </Modal>
  )
}
