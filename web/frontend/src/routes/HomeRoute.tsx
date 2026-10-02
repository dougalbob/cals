import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, queryKeys } from '../api/client'
import { addDrinkEntry, deleteDrinkEntry } from '../api/diary'
import { MEALS, type Drink, type User } from '../api/types'
import { CalorieRing } from '../components/CalorieRing'
import { FluidsCard, pickWaterDrink } from '../components/FluidsCard'
import { Modal } from '../components/Modal'
import { useBank, useDiary, useDrinkDefinitions, useDrinkEntries, useWater } from '../hooks/useDiaryData'
import { formatLongDate, formatNumber, todayIso } from '../lib/format'

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/**
 * "Today" — the landing page for the current state of play.
 *
 * Designed around four primary interactions:
 * 1. At a glance calorie ring (outer available vs inner daily allowance countdown).
 * 2. 4 square meal buttons in a row showing calories, meal icon, items count,
 *    linking directly to that meal in the diary.
 * 3. Merged FluidsCard with the draining water glass and quick drinks, counters,
 *    and long-press deletion with confirmation.
 */
export function HomeRoute() {
  const queryClient = useQueryClient()
  const date = todayIso()

  const [pendingDrink, setPendingDrink] = useState<number | null>(null)
  const [deletingEntryId, setDeletingEntryId] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ entryId: number; drinkName: string } | null>(null)

  const user = useQuery<User>({
    queryKey: queryKeys.user,
    queryFn: () => apiGet<User>('/api/users/me'),
  })
  const diary = useDiary(date)
  const bank = useBank(date)
  const drinks = useDrinkEntries(date)
  const drinkDefinitions = useDrinkDefinitions()
  const water = useWater(date)

  const refreshDrinkData = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.drinks(date) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.water(date) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.bank(date) })
  }

  const addDrink = useMutation({
    mutationFn: ({ drink, volumeMl }: { drink: Drink; volumeMl?: number }) =>
      addDrinkEntry(drink.id, date, volumeMl),
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

  const entries = useMemo(() => diary.data?.entries ?? [], [diary.data?.entries])
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
  const waterDrink = pickWaterDrink(waterDrinks)

  const mealSummaries = useMemo(
    () =>
      MEALS.map((meal) => {
        const mealEntries = entries.filter((entry) => entry.meal === meal.id)
        return {
          ...meal,
          count: mealEntries.length,
          calories: Math.round(mealEntries.reduce((acc, entry) => acc + entry.calories, 0)),
        }
      }),
    [entries],
  )

  if (diary.isPending || bank.isPending) {
    return <p className="text-ink-light">Loading today…</p>
  }

  if (diary.isError || bank.isError) {
    const message = (diary.error ?? bank.error) as Error
    return (
      <div className="rounded-xl bg-card p-4 shadow-card">
        <p className="font-medium text-danger m-0">Could not load today</p>
        <p className="text-sm text-ink-light mb-0">{message.message}</p>
      </div>
    )
  }

  const firstName = user.data?.name?.trim().split(/\s+/)[0] ?? ''

  return (
    <div className="flex flex-col gap-4">
      {/* Where am I today? Ring + Macro / Bank summary -------------------- */}
      <section className="rounded-2xl bg-card p-4 shadow-card">
        <p className="m-0 text-xs uppercase tracking-wide text-ink-light">
          {greeting(new Date().getHours())}
          {firstName ? `, ${firstName}` : ''}
        </p>
        <h2 className="m-0 text-base font-semibold">{formatLongDate(date)}</h2>

        <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
          <CalorieRing consumed={consumed} available={available} goal={bank.data?.daily_goal ?? 0} />

          <div className="w-full flex-1 grid grid-cols-2 gap-3">
            <Tile label="Daily goal" value={formatNumber(bank.data?.daily_goal ?? 0)} unit="kcal" />
            <Tile
              label={bankBalance >= 0 ? 'Banked' : 'Deficit'}
              value={`${bankBalance >= 0 ? '+' : ''}${formatNumber(bankBalance)}`}
              unit="kcal"
              tone={bankBalance >= 0 ? 'success' : 'danger'}
            />
            <Tile label="Food" value={formatNumber(foodCalories)} unit="kcal" />
            <Tile label="Drinks" value={formatNumber(drinkCalories)} unit="kcal" hint="counts towards the bank" />
          </div>
        </div>
      </section>

      {/* Meals today: 4 square buttons in a row --------------------------- */}
      <section className="rounded-2xl bg-card p-3 shadow-card" aria-label="Meals today">
        <div className="grid grid-cols-4 gap-2">
          {mealSummaries.map((meal) => (
            <Link
              key={meal.id}
              to={`/diary/${date}#${meal.id}`}
              className="flex flex-col items-center justify-between p-2 rounded-xl border border-line bg-surface hover:border-primary-light active:scale-95 transition-all no-underline text-ink min-h-[5.5rem]"
              aria-label={`${meal.label}: ${meal.calories} kcal, ${meal.count} items`}
            >
              <span className="text-xs font-semibold tabular-nums text-primary-dark">
                {meal.calories} <span className="text-[0.65rem] font-normal text-ink-light">kcal</span>
              </span>

              <span aria-hidden className="text-2xl my-0.5 leading-none">
                {meal.icon}
              </span>

              <span className="flex flex-col items-center leading-tight">
                <span className="text-[0.68rem] font-medium text-ink truncate w-full text-center">
                  {meal.label}
                </span>
                <span className="text-[0.62rem] text-ink-light tabular-nums">
                  {meal.count} {meal.count === 1 ? 'item' : 'items'}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Merged Fluids Card: Water glass + Quick Drinks in one card ------- */}
      <FluidsCard
        consumedMl={water.data?.consumed_ml ?? 0}
        targetMl={water.data?.target_ml ?? 2000}
        waterDrink={waterDrink}
        drinks={drinkDefinitions.data ?? []}
        entries={drinks.data ?? []}
        onAddDrink={(drink, volumeMl) => addDrink.mutate({ drink, volumeMl })}
        onDeleteDrinkEntry={(entryId, drinkName) => setDeleteConfirm({ entryId, drinkName })}
        pendingDrinkId={pendingDrink}
        deletingEntryId={deletingEntryId}
        error={
          (addDrink.isError ? (addDrink.error as Error).message : null) ||
          (removeDrink.isError ? (removeDrink.error as Error).message : null) ||
          (water.isError ? (water.error as Error).message : null)
        }
      />

      <Link
        to={`/diary/${date}`}
        className="mx-auto min-h-11 rounded-xl px-4 py-2 text-sm font-medium text-primary-dark no-underline hover:underline"
      >
        Open the full diary →
      </Link>

      {/* Deletion confirmation modal for long-press ----------------------- */}
      <Modal
        open={deleteConfirm !== null}
        title="Delete drink entry?"
        onClose={() => setDeleteConfirm(null)}
      >
        {deleteConfirm && (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-sm text-ink">
              Remove the latest logged <span className="font-semibold">{deleteConfirm.drinkName}</span> from today?
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
