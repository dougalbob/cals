import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, queryKeys } from '../api/client'
import {
  addDrinkEntry,
  createDiaryEntry,
  deleteDiaryEntry,
  deleteDrinkEntry,
  updateDiaryEntry,
} from '../api/diary'
import type { CreateDiaryEntryInput } from '../api/diary'
import { MEALS, type DiaryEntry, type Drink, type Food, type Meal } from '../api/types'
import { CalorieRing } from '../components/CalorieRing'
import { FluidsCard, pickWaterDrink } from '../components/FluidsCard'
import { QuantityPicker } from '../components/QuantityPicker'
import { useBank, useDiary, useDrinkDefinitions, useDrinkEntries, useWater } from '../hooks/useDiaryData'
import { Modal } from '../components/Modal'
import { useDebounced } from '../hooks/useDebounced'
import { addDays, formatGrams, formatNumber, todayIso } from '../lib/format'
import { caloriesPer100g, nutritionForGrams, scaleEntryToGrams } from '../lib/diary'
import { defaultServing, servingChoices } from '../lib/foodServings'
import { startRecipePickHref } from '../lib/recipePick'

const MEAL_ACCENT: Record<Meal, string> = {
  breakfast: 'border-l-meal-breakfast',
  lunch: 'border-l-meal-lunch',
  dinner: 'border-l-meal-dinner',
  snacks: 'border-l-meal-snacks',
}

export function DiaryRoute() {
  const { date: dateParam } = useParams()
  const navigate = useNavigate()
  const { hash } = useLocation()
  const queryClient = useQueryClient()

  const today = todayIso()
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today

  const [addingTo, setAddingTo] = useState<Meal | null>(null)
  const [pendingDrink, setPendingDrink] = useState<number | null>(null)
  const [deletingEntryId, setDeletingEntryId] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ entryId: number; drinkName: string } | null>(null)
  const [editingEntry, setEditingEntry] = useState<DiaryEntry | null>(null)

  const diary = useDiary(date)
  const bank = useBank(date)
  const drinks = useDrinkEntries(date)
  const drinkDefinitions = useDrinkDefinitions()
  const water = useWater(date)

  // Deep links from the Today screen (`/diary/2026-10-02#dinner`) land on the
  // meal that was tapped rather than at the top of a long page.
  useEffect(() => {
    if (!hash || diary.isPending || bank.isPending) return
    const target = document.getElementById(hash.slice(1))
    if (target) target.scrollIntoView({ block: 'start' })
  }, [hash, date, diary.isPending, bank.isPending])

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

  /** Editing the weight rescales the entry's own saved snapshot; no definition is re-read. */
  const updateEntry = useMutation({
    mutationFn: ({ entry, grams }: { entry: DiaryEntry; grams: number }) => {
      const update = scaleEntryToGrams(entry, grams)
      if (!update) return Promise.reject(new Error('Enter a weight greater than zero'))
      return updateDiaryEntry(entry.id, update)
    },
    onSuccess: () => {
      setEditingEntry(null)
      void queryClient.invalidateQueries({ queryKey: queryKeys.diary(date) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.bank(date) })
    },
  })

  const addEntry = useMutation({
    mutationFn: (payload: CreateDiaryEntryInput) => createDiaryEntry(date, payload),
    onSuccess: () => {
      setAddingTo(null)
      void queryClient.invalidateQueries({ queryKey: queryKeys.diary(date) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.bank(date) })
    },
  })

  const addDrink = useMutation({
    mutationFn: ({
      drink,
      volumeMl,
      calories,
    }: {
      drink: Drink
      volumeMl?: number
      calories?: number
    }) => addDrinkEntry(drink.id, date, { volumeMl, calories }),
    onMutate: ({ drink }) => setPendingDrink(drink.id),
    onSettled: () => setPendingDrink(null),
    onSuccess: refreshDrinkData,
  })

  const removeDrink = useMutation({
    mutationFn: deleteDrinkEntry,
    onMutate: (id) => setDeletingEntryId(id),
    onSettled: () => setDeletingEntryId(null),
    onSuccess: () => {
      setDeleteConfirm(null)
      refreshDrinkData()
    },
  })

  const entries = diary.data?.entries ?? []
  const foodCalories = diary.data?.totals.calories ?? 0
  const drinkCalories = useMemo(
    () => (drinks.data ?? []).reduce((acc, entry) => acc + entry.calories, 0),
    [drinks.data],
  )
  const consumed = Math.round(foodCalories + drinkCalories)
  const bankBalance = bank.data?.bank_balance ?? 0

  const waterDrink = pickWaterDrink(drinkDefinitions.data ?? [])

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
        <div className="text-center flex-1">
          <p className="m-0 font-semibold">
            {date === today ? 'Today' : new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })}
          </p>
          <p className="m-0 text-xs text-ink-light">
            {new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}
          </p>
        </div>
        <Link
          to={date === today ? '/calendar' : `/calendar/week/${date}`}
          aria-label="Open calendar"
          className="min-h-11 min-w-11 rounded-xl bg-card border border-line text-base flex items-center justify-center no-underline text-ink cursor-pointer hover:border-primary"
          title="Calendar"
        >
          📅
        </Link>
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
        <CalorieRing consumed={consumed} bankBalance={bankBalance} goal={bank.data?.daily_goal ?? 0} />
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

      {/* Merged Fluids Card: Water glass + Quick Drinks ------------------ */}
      <FluidsCard
        consumedMl={water.data?.consumed_ml ?? 0}
        targetMl={water.data?.target_ml ?? 2000}
        waterDrink={waterDrink}
        drinks={drinkDefinitions.data ?? []}
        entries={drinks.data ?? []}
        onAddDrink={(drink, opts) => addDrink.mutate({ drink, ...opts })}
        onDeleteDrinkEntry={(entryId, drinkName) => setDeleteConfirm({ entryId, drinkName })}
        pendingDrinkId={pendingDrink}
        deletingEntryId={deletingEntryId}
        error={
          (addDrink.isError ? (addDrink.error as Error).message : null) ||
          (removeDrink.isError ? (removeDrink.error as Error).message : null) ||
          (water.isError ? (water.error as Error).message : null)
        }
      />

      {/* Meals ---------------------------------------------------------- */}
      {MEALS.map((meal) => {
        const mealEntries = entries.filter((entry) => entry.meal === meal.id)
        const mealCalories = mealEntries.reduce((acc, entry) => acc + entry.calories, 0)
        return (
          <section
            key={meal.id}
            id={meal.id}
            className={`scroll-mt-4 rounded-2xl bg-card shadow-card border-l-4 ${MEAL_ACCENT[meal.id]}`}
          >
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
                    onClick={() => setEditingEntry(entry)}
                    className="min-h-11 min-w-11 rounded-lg bg-transparent border border-line text-ink-light cursor-pointer"
                    aria-label={`Edit ${entry.food_name || entry.recipe_name}`}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteEntry.mutate(entry.id)}
                    disabled={deleteEntry.isPending}
                    className="min-h-11 min-w-11 rounded-lg bg-transparent border border-line text-ink-light cursor-pointer disabled:opacity-40"
                    aria-label={`Delete ${entry.food_name || entry.recipe_name}`}
                  >
                    🗑
                  </button>
                </li>
              ))}
              {mealEntries.length === 0 && <li className="py-2 text-sm text-ink-muted">Nothing logged yet</li>}
            </ul>

            {/* Two ways to fill a meal. Food is searched in place, because the
                food a person wants is usually one keystroke away. A recipe is
                *not*: the recipe box already has the search, favourites and tag
                filters a picker would have to duplicate, so this hands over to
                it and carries the meal and the viewed date along (decision 40,
                owner's 2026-10-03 follow-up). */}
            <div className="px-4 pb-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAddingTo(meal.id)}
                className="min-h-10 rounded-xl bg-primary-light/15 text-primary-dark font-medium border-0 cursor-pointer"
              >
                + Add food
              </button>
              <button
                type="button"
                onClick={() => navigate(startRecipePickHref(meal.id, date))}
                title="Choose from the recipe box — the meal and date come with you"
                className="min-h-10 rounded-xl bg-surface border border-line text-ink font-medium cursor-pointer"
              >
                🍽 Add recipe
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

      {/* Keyed by meal so a fresh open starts clean, not on last time's food. */}
      <AddFoodModal
        key={addingTo ?? 'closed'}
        meal={addingTo}
        onClose={() => setAddingTo(null)}
        onAdd={(food, grams) => {
          const nutrition = nutritionForGrams(food, grams)
          if (typeof food.id !== 'number' || !nutrition) return
          addEntry.mutate({ meal: addingTo as Meal, food_id: food.id, ...nutrition })
        }}
        saving={addEntry.isPending}
        error={addEntry.isError ? (addEntry.error as Error).message : null}
      />

      {/* Edit the weight of a logged entry. Keyed by id so the input resets per entry. */}
      {editingEntry && (
        <EditQuantityModal
          key={editingEntry.id}
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
          onSave={(grams) => updateEntry.mutate({ entry: editingEntry, grams })}
          saving={updateEntry.isPending}
          error={updateEntry.isError ? (updateEntry.error as Error).message : null}
        />
      )}

      {/* Deletion confirmation modal for long-press ----------------------- */}
      <Modal
        open={deleteConfirm !== null}
        title="Delete drink entry?"
        onClose={() => setDeleteConfirm(null)}
      >
        {deleteConfirm && (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-sm text-ink">
              Remove the latest logged <span className="font-semibold">{deleteConfirm.drinkName}</span> from {date === today ? 'today' : date}?
            </p>
            <div className="flex items-center justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="min-h-10 px-3.5 rounded-xl border border-line bg-surface text-ink text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={removeDrink.isPending}
                onClick={() => removeDrink.mutate(deleteConfirm.entryId)}
                className="min-h-10 px-4 rounded-xl bg-danger text-white text-sm font-medium border-0 cursor-pointer disabled:opacity-50"
              >
                {removeDrink.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </Modal>
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

function EditQuantityModal({
  entry,
  onClose,
  onSave,
  saving,
  error,
}: {
  entry: DiaryEntry
  onClose: () => void
  onSave: (grams: number) => void
  saving: boolean
  error: string | null
}) {
  const name = entry.food_name || entry.recipe_name || 'this entry'
  const [gramsText, setGramsText] = useState(String(entry.quantity_grams))
  const grams = Number.parseFloat(gramsText)
  const valid = Number.isFinite(grams) && grams > 0
  const per100g = caloriesPer100g(entry)
  // The preview scales the entry's own saved values, so it can never promise a
  // number the save would not write. The entry's saved snapshot stays the
  // basis — a food definition edited since the log cannot rewrite the day.
  const update = valid ? scaleEntryToGrams(entry, grams) : null
  const changed = valid && grams !== entry.quantity_grams
  const foodMeasures = {
    serving_name: entry.food_serving_name,
    serving_grams: entry.food_serving_grams,
    servings: entry.food_servings,
  }
  const hasMeasures = servingChoices(foodMeasures).length > 0

  return (
    <Modal open title={`Edit ${name}`} onClose={onClose}>
      <p className="m-0 text-xs text-ink-light">
        Logged as {formatGrams(entry.quantity_grams)} · {formatNumber(entry.calories)} kcal
        {per100g !== null ? ` · ${formatNumber(per100g)} kcal per 100 g` : ''}
      </p>

      <div className="mt-4">
        <QuantityPicker
          key={entry.id}
          food={foodMeasures}
          value={gramsText}
          onValueChange={setGramsText}
          grams={grams}
          idPrefix="edit-entry"
          preview={
            valid && update
              ? `${formatGrams(grams)} = ${formatNumber(update.calories)} kcal`
              : 'Enter a weight greater than zero'
          }
        />
      </div>

      {hasMeasures && (
        <p className="m-0 mt-2 text-xs text-ink-light">
          A serving is converted to grams; the entry keeps its own saved nutrition.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 mb-0 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 mt-4">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 px-3.5 rounded-xl border border-line bg-surface text-ink text-sm cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!valid || !changed || saving}
          onClick={() => onSave(grams)}
          className="min-h-11 px-4 rounded-xl bg-primary text-white text-sm font-medium border-0 cursor-pointer disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
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
  const [selected, setSelected] = useState<Food | null>(null)
  const [gramsText, setGramsText] = useState('100')
  const debounced = useDebounced(term, 250)

  const results = useQuery<Food[]>({
    queryKey: queryKeys.foodSearch(debounced),
    queryFn: () => apiGet<Food[]>(`/api/foods/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.trim().length >= 2 && selected === null,
  })

  const label = MEALS.find((m) => m.id === meal)?.label ?? ''
  const grams = Number.parseFloat(gramsText)
  const nutrition = selected ? nutritionForGrams(selected, grams) : null

  /** Start on the food's preferred measure when it has one; grams otherwise. */
  const choose = (food: Food) => {
    setSelected(food)
    setGramsText(defaultServing(food) === null ? '100' : String(defaultServing(food)?.grams))
  }

  const close = () => {
    setSelected(null)
    setTerm('')
    onClose()
  }

  return (
    <Modal open={meal !== null} title={selected ? `Add ${selected.name}` : `Add to ${label}`} onClose={close}>
      {selected ? (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-xs text-ink-light">
            {formatNumber(selected.calories_per_100g)} kcal per 100 g
            {selected.brand ? ` · ${selected.brand}` : ''}
          </p>

          <QuantityPicker
            key={String(selected.id)}
            food={selected}
            value={gramsText}
            onValueChange={setGramsText}
            grams={grams}
            idPrefix="add-food"
            preview={
              nutrition
                ? `${formatGrams(grams)} = ${formatNumber(nutrition.calories)} kcal`
                : 'Enter a weight greater than zero'
            }
          />

          {error && (
            <p role="alert" className="m-0 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="min-h-11 px-3 rounded-xl border border-line bg-surface text-sm text-ink"
            >
              ← Different food
            </button>
            <button
              type="button"
              disabled={!nutrition || saving}
              onClick={() => selected && onAdd(selected, grams)}
              className="min-h-11 px-4 rounded-xl bg-primary text-white text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Adding…' : `Add to ${label}`}
            </button>
          </div>
        </div>
      ) : (
        <>
          <input
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search foods…"
            autoFocus
            className="w-full min-h-11 rounded-xl border border-line px-3 mb-3 text-base"
          />

          {error && (
            <p role="alert" className="m-0 mb-2 text-sm text-danger">
              {error}
            </p>
          )}
          {results.isFetching && <p className="text-sm text-ink-light m-0">Searching…</p>}

          <ul className="list-none m-0 p-0">
            {(results.data ?? []).map((food) => {
              const portion = defaultServing(food)
              const portionGrams = portion?.grams ?? 100
              const kcal = Math.round((food.calories_per_100g * portionGrams) / 100)
              return (
                <li key={String(food.id)} className="border-b border-line-light last:border-0">
                  <button
                    type="button"
                    disabled={saving || typeof food.id === 'string'}
                    onClick={() => choose(food)}
                    className="w-full text-left bg-transparent border-0 py-2.5 min-h-11 cursor-pointer disabled:opacity-40"
                    title={typeof food.id === 'string' ? 'FatSecret results are read-only in the spike' : undefined}
                  >
                    <span className="block text-sm font-medium">
                      {food.name}
                      {food.brand ? <span className="text-ink-light font-normal"> · {food.brand}</span> : null}
                    </span>
                    <span className="block text-xs text-ink-light">
                      {formatNumber(kcal)} kcal for{' '}
                      {portion ? `${portion.label} (${formatGrams(portionGrams)})` : formatGrams(portionGrams)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          {debounced.trim().length >= 2 && !results.isFetching && (results.data ?? []).length === 0 && (
            <p className="text-sm text-ink-muted">No matches.</p>
          )}
          {debounced.trim().length < 2 && <p className="text-sm text-ink-muted">Type at least 2 characters.</p>}
        </>
      )}
    </Modal>
  )
}
