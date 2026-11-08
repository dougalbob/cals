import { useMemo } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { apiGet, queryKeys } from '../api/client'
import { MEALS, type User } from '../api/types'
import { CalorieRing } from '../components/CalorieRing'
import { useBank, useDiary, useDrinkEntries } from '../hooks/useDiaryData'
import { bankWindowLabel } from '../lib/bank'
import { formatLongDate, formatNumber, todayIso } from '../lib/format'

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/**
 * "Today" — the landing page for the current state of play.
 *
 * The Today landing page is a concise summary: calorie balance, food/drink
 * totals, and four meal cards that link to their itemised Diary sections.
 * Hydration and quick-drink actions live on the Diary page.
 */
export function HomeRoute() {
  const date = todayIso()

  const user = useQuery<User>({
    queryKey: queryKeys.user,
    queryFn: () => apiGet<User>('/api/users/me'),
  })
  const diary = useDiary(date)
  const bank = useBank(date)
  const drinks = useDrinkEntries(date)

  const entries = useMemo(() => diary.data?.entries ?? [], [diary.data?.entries])
  const foodCalories = diary.data?.totals.calories ?? 0
  const drinkCalories = useMemo(
    () => (drinks.data ?? []).reduce((acc, entry) => acc + entry.calories, 0),
    [drinks.data],
  )
  const consumed = Math.round(foodCalories + drinkCalories)
  const bankBalance = bank.data?.bank_balance ?? 0
  // The bank is a rolling window (decisions 66, 92): the tile must name it, so
  // the figure cannot be mistaken for the old since-day-one accumulation.
  const bankWindow = bankWindowLabel(bank.data?.window_days)

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
  const totalMealCalories = mealSummaries.reduce((total, meal) => total + meal.calories, 0)

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
          <CalorieRing
            consumed={consumed}
            bankBalance={bankBalance}
            goal={bank.data?.daily_goal ?? 0}
            bankWindowDays={bank.data?.window_days}
            bankSurplusLimitKcal={user.data?.bank_ring_surplus_limit_kcal}
            bankDeficitLimitKcal={user.data?.bank_ring_deficit_limit_kcal}
          />

          <div className="w-full flex-1 grid grid-cols-2 gap-3">
            <Tile label="Daily goal" value={formatNumber(bank.data?.daily_goal ?? 0)} unit="kcal" />
            <Tile
              label={bankBalance >= 0 ? 'Banked' : 'Deficit'}
              value={`${bankBalance >= 0 ? '+' : ''}${formatNumber(bankBalance)}`}
              unit="kcal"
              tone={bankBalance >= 0 ? 'success' : 'danger'}
              hint={bankWindow ?? undefined}
            />
            <Tile label="Food" value={formatNumber(foodCalories)} unit="kcal" />
            <Tile label="Drinks" value={formatNumber(drinkCalories)} unit="kcal" hint="counts towards the bank" />
          </div>
        </div>
      </section>

      {/* Meals today: 4 square buttons in a row --------------------------- */}
      <section className="rounded-2xl bg-card p-3 shadow-card" aria-label="Meals today">
        <div className="grid grid-cols-4 gap-2">
          {mealSummaries.map((meal) => {
            const fillPercent =
              totalMealCalories > 0
                ? Math.max(0, Math.min(100, (meal.calories / totalMealCalories) * 100))
                : 0
            return (
              <Link
                key={meal.id}
                to={`/diary/${date}#${meal.id}`}
                className="relative isolate flex flex-col items-center justify-between overflow-hidden p-2 rounded-xl border border-line bg-surface hover:border-primary-light active:scale-95 transition-all no-underline text-ink min-h-[5.5rem]"
                aria-label={`${meal.label}: ${meal.calories} kcal, ${meal.count} items`}
              >
                <span
                  data-calorie-fill
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-0 z-0 rounded-l-xl bg-primary-light/25 transition-[width] duration-300"
                  style={{ width: `${fillPercent}%` }}
                />
                <span className="relative z-10 text-xs font-semibold tabular-nums text-primary-dark">
                  {meal.calories} <span className="text-[0.65rem] font-normal text-ink-light">kcal</span>
                </span>

                <span aria-hidden className="relative z-10 text-2xl my-0.5 leading-none">
                  {meal.icon}
                </span>

                <span className="relative z-10 flex flex-col items-center leading-tight">
                  <span className="text-[0.68rem] font-medium text-ink truncate w-full text-center">
                    {meal.label}
                  </span>
                  <span className="text-[0.62rem] text-ink-light tabular-nums">
                    {meal.count} {meal.count === 1 ? 'item' : 'items'}
                  </span>
                </span>
              </Link>
            )
          })}
        </div>
      </section>

      <Link
        to={`/diary/${date}`}
        className="mx-auto min-h-11 rounded-xl px-4 py-2 text-sm font-medium text-primary-dark no-underline hover:underline"
      >
        Open the full diary →
      </Link>
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
