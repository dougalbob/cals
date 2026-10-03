import { useMemo } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../api/client'
import { getCalendar } from '../api/calendar'
import type { CalendarDay, Meal } from '../api/types'
import {
  WEEKDAY_HEADERS,
  addDays,
  addMonths,
  calorieRatio,
  formatDayNumber,
  formatMonthLabel,
  formatWeekRangeLabel,
  hydrationRatio,
  monthForIso,
  monthGridRange,
  todayIso,
  weekRange,
  type CalendarView,
} from '../lib/calendar'
import { formatNumber } from '../lib/format'

/**
 * Calendar (decision 49 follow-up).
 *
 * Two views share one route:
 *  - Month: 6 × 7 wall-calendar grid, compact cells with a small calorie bar,
 *    hydration pip, bank figure and day number.
 *  - Week:  1 × 7 list of larger cards with meal breakdowns, hydration and
 *    bank — the phone-friendly view the owner asked for.
 *
 * The view rides in the URL (`/calendar/month/2026-10` or `/calendar/week/2026-10-05`,
 * where the week param is any day inside the target week) so reload and deep
 * links are stable. Tapping a day navigates to `/diary/:date`.
 */
export function CalendarRoute() {
  const params = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const today = todayIso()
  const view: CalendarView = params.view === 'week' ? 'week' : 'month'
  // Anchor date: the segment after the view. Month uses YYYY-MM; week uses any
  // ISO date inside the target week.
  const anchor =
    typeof params.anchor === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(params.anchor)
      ? params.anchor
      : today

  // Normalise to a fetchable range.
  const range = useMemo(() => {
    if (view === 'week') return weekRange(anchor.length === 7 ? `${anchor}-01` : anchor)
    return monthGridRange(anchor.length === 7 ? anchor : monthForIso(anchor))
  }, [view, anchor])

  const monthKey = view === 'month' && anchor.length >= 7 ? anchor.slice(0, 7) : monthForIso(today)
  const weekAnchorIso = view === 'week' && anchor.length === 10 ? anchor : today

  const calendar = useQuery({
    queryKey: queryKeys.calendar(range.from, range.to),
    queryFn: () => getCalendar(range.from, range.to),
    staleTime: 60_000,
  })

  const dayByDate = useMemo(() => {
    const map = new Map<string, CalendarDay>()
    for (const d of calendar.data?.days ?? []) map.set(d.date, d)
    return map
  }, [calendar.data])

  const goMonth = (direction: -1 | 1) => {
    const next = addMonths(monthKey, direction)
    navigate(`/calendar/month/${next}${searchParams.size ? `?${searchParams}` : ''}`)
  }

  const goWeek = (direction: -1 | 1) => {
    const next = addDays(weekAnchorIso, direction * 7)
    navigate(`/calendar/week/${next}${searchParams.size ? `?${searchParams}` : ''}`)
  }

  const switchView = (next: CalendarView) => {
    if (next === view) return
    if (next === 'month') {
      navigate(`/calendar/month/${monthKey}`)
    } else {
      navigate(`/calendar/week/${weekAnchorIso}`)
    }
  }

  const goToday = () =>
    navigate(view === 'month' ? `/calendar/month/${monthForIso(today)}` : `/calendar/week/${today}`)

  const headerLabel =
    view === 'month'
      ? formatMonthLabel(monthKey)
      : formatWeekRangeLabel(range.from, range.to)

  return (
    <div className="flex flex-col gap-3">
      <header className="flex items-center justify-between gap-2">
        <div>
          <p className="m-0 text-xs uppercase tracking-wide text-ink-light">Calendar</p>
          <h2 className="m-0 text-lg font-semibold">{headerLabel}</h2>
        </div>
        <div className="flex gap-1 rounded-full border border-line bg-surface p-0.5">
          <ViewTab active={view === 'month'} onClick={() => switchView('month')} label="Month" />
          <ViewTab active={view === 'week'} onClick={() => switchView('week')} label="Week" />
        </div>
      </header>

      <nav className="flex items-center justify-between gap-2" aria-label="Calendar navigation">
        <button
          type="button"
          onClick={() => (view === 'month' ? goMonth(-1) : goWeek(-1))}
          className="min-h-11 min-w-11 rounded-xl bg-card border border-line text-lg cursor-pointer"
          aria-label={view === 'month' ? 'Previous month' : 'Previous week'}
        >
          ‹
        </button>
        <button
          type="button"
          onClick={goToday}
          className="min-h-11 rounded-xl border border-line bg-surface px-4 text-sm font-medium cursor-pointer"
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => (view === 'month' ? goMonth(1) : goWeek(1))}
          className="min-h-11 min-w-11 rounded-xl bg-card border border-line text-lg cursor-pointer"
          aria-label={view === 'month' ? 'Next month' : 'Next week'}
        >
          ›
        </button>
      </nav>

      {calendar.isPending && <p className="text-sm text-ink-light py-6 text-center">Loading…</p>}
      {calendar.isError && (
        <p role="alert" className="m-0 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          Could not load calendar: {(calendar.error as Error).message}
        </p>
      )}

      {calendar.data && view === 'month' && (
        <MonthGrid days={buildGrid(range.from, range.to, dayByDate)} from={range.from} />
      )}
      {calendar.data && view === 'week' && (
        <WeekList days={buildWeek(range.from, range.to, dayByDate)} />
      )}
    </div>
  )
}

function ViewTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-9 px-3 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
        active ? 'bg-primary text-white' : 'text-ink-light hover:text-ink'
      }`}
    >
      {label}
    </button>
  )
}

function buildGrid(
  from: string,
  to: string,
  map: Map<string, CalendarDay>,
): CalendarDay[] {
  const days: CalendarDay[] = []
  let cur = from
  while (cur <= to) {
    days.push(
      map.get(cur) ?? {
        date: cur,
        food_calories: 0,
        drink_calories: 0,
        calories: 0,
        goal: 0,
        hydration_ml: 0,
        hydration_target_ml: 0,
        bank_balance: 0,
        meals: {},
        is_today: false,
        has_data: false,
      },
    )
    cur = addDays(cur, 1)
  }
  return days
}

function buildWeek(from: string, to: string, map: Map<string, CalendarDay>): CalendarDay[] {
  return buildGrid(from, to, map)
}

function MonthGrid({ days, from }: { days: CalendarDay[]; from: string }) {
  const monthOfFirst = from.slice(0, 7)
  return (
    <section className="rounded-2xl bg-card p-3 shadow-card">
      <div className="grid grid-cols-7 gap-1 text-center text-[0.65rem] font-semibold uppercase text-ink-light pb-1">
        {WEEKDAY_HEADERS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => (
          <MonthCell key={day.date} day={day} inMonth={day.date.slice(0, 7) === monthOfFirst} />
        ))}
      </div>
      <Legend />
    </section>
  )
}

function MonthCell({ day, inMonth }: { day: CalendarDay; inMonth: boolean }) {
  const ratio = calorieRatio(day.calories, day.goal)
  const hydr = hydrationRatio(day.hydration_ml, day.hydration_target_ml)
  const over = day.calories > day.goal
  // Compact bar: green under goal, red over goal.
  const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)))
  return (
    <Link
      to={`/diary/${day.date}`}
      className={[
        'relative min-h-[72px] rounded-lg border p-1.5 text-left no-underline text-ink transition-colors',
        day.is_today ? 'border-primary ring-1 ring-primary/40' : 'border-line-light',
        inMonth ? 'bg-surface' : 'bg-transparent opacity-40',
        day.has_data ? 'cursor-pointer hover:border-primary' : 'cursor-pointer',
      ].join(' ')}
      aria-label={`${day.date}: ${formatNumber(Math.round(day.calories))} kcal of ${formatNumber(day.goal)}, bank ${day.bank_balance >= 0 ? '+' : ''}${formatNumber(day.bank_balance)} kcal`}
    >
      <div className="flex items-start justify-between">
        <span
          className={`text-xs font-semibold tabular-nums ${
            day.is_today
              ? 'inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-white'
              : ''
          }`}
        >
          {formatDayNumber(day.date)}
        </span>
        {day.has_data && hydr >= 1 && (
          <span aria-hidden className="text-[0.6rem] leading-none text-info" title="Hydration target met">
            💧
          </span>
        )}
      </div>
      {day.has_data && (
        <>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line-light">
            <div
              className={`h-full rounded-full ${over ? 'bg-danger' : 'bg-success'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="m-0 mt-1 text-[0.6rem] tabular-nums text-ink-light leading-tight">
            {bankLabel(day.bank_balance)}
          </p>
        </>
      )}
    </Link>
  )
}

function WeekList({ days }: { days: CalendarDay[] }) {
  return (
    <div className="flex flex-col gap-2">
      {days.map((day) => (
        <WeekDayCard key={day.date} day={day} />
      ))}
      <Legend />
    </div>
  )
}

const MEAL_ORDER: Meal[] = ['breakfast', 'lunch', 'dinner', 'snacks']
const MEAL_LABEL: Record<Meal, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
}
const MEAL_ICON: Record<Meal, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snacks: '🍿',
}

function WeekDayCard({ day }: { day: CalendarDay }) {
  const dow = new Date(`${day.date}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    timeZone: 'UTC',
  })
  const domLabel = new Date(`${day.date}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
  const ratio = calorieRatio(day.calories, day.goal)
  const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)))
  const over = day.calories > day.goal
  const hydr = hydrationRatio(day.hydration_ml, day.hydration_target_ml)

  return (
    <Link
      to={`/diary/${day.date}`}
      className={[
        'block rounded-2xl bg-card p-3 shadow-card no-underline text-ink',
        day.is_today ? 'ring-2 ring-primary/50' : '',
      ].join(' ')}
      aria-label={`Open diary for ${dow} ${domLabel}`}
    >
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <p className={`m-0 text-sm font-semibold ${day.is_today ? 'text-primary-dark' : ''}`}>
            {dow}
            {day.is_today && <span className="ml-1 text-[0.65rem] font-medium text-primary">Today</span>}
          </p>
          <p className="m-0 text-xs text-ink-light">{domLabel}</p>
        </div>
        <div className="text-right">
          <p className="m-0 text-sm font-semibold tabular-nums">
            {formatNumber(Math.round(day.calories))}
            <span className="text-xs font-normal text-ink-light"> / {formatNumber(day.goal)} kcal</span>
          </p>
          <p
            className={`m-0 text-xs tabular-nums ${
              day.bank_balance >= 0 ? 'text-success' : 'text-danger'
            }`}
          >
            {bankLabel(day.bank_balance)}
          </p>
        </div>
      </header>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line-light">
        <div
          className={`h-full rounded-full ${over ? 'bg-danger' : 'bg-success'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="m-0 mt-2 grid grid-cols-2 gap-x-3 gap-y-1 p-0 text-xs text-ink-light">
        {MEAL_ORDER.map((meal) => {
          const kcal = day.meals[meal] ?? 0
          if (!day.has_data) return null
          return (
            <li key={meal} className="flex items-center justify-between gap-2">
              <span>
                <span aria-hidden className="mr-1">{MEAL_ICON[meal]}</span>
                {MEAL_LABEL[meal]}
              </span>
              <span className="tabular-nums text-ink">{kcal > 0 ? `${formatNumber(kcal)} kcal` : '—'}</span>
            </li>
          )
        })}
        <li className="flex items-center justify-between gap-2">
          <span>
            <span aria-hidden className="mr-1">💧</span>
            Hydration
          </span>
          <span className={`tabular-nums ${hydr >= 1 ? 'text-info' : 'text-ink'}`}>
            {formatNumber(day.hydration_ml)} / {formatNumber(day.hydration_target_ml)} ml
          </span>
        </li>
      </ul>

      {!day.has_data && (
        <p className="m-0 mt-2 text-xs text-ink-muted">Nothing logged yet — tap to open this day.</p>
      )}
    </Link>
  )
}

function bankLabel(balance: number): string {
  const sign = balance >= 0 ? '+' : '−'
  return `${sign}${formatNumber(Math.abs(balance))} kcal`
}

function Legend() {
  return (
    <p className="m-0 mt-2 text-[0.65rem] text-ink-muted leading-relaxed">
      <span className="inline-block h-1.5 w-4 align-middle rounded-full bg-success mr-1" /> at or under goal
      <span className="mx-1.5">·</span>
      <span className="inline-block h-1.5 w-4 align-middle rounded-full bg-danger mr-1" /> over goal
      <span className="mx-1.5">·</span>
      tap any day to open its diary.
    </p>
  )
}
