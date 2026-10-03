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
  calorieBarSplit,
  clampMonthToToday,
  clampWeekAnchorToToday,
  formatDayNumber,
  formatMonthLabel,
  formatWeekRangeLabel,
  hydrationRatio,
  isFutureDay,
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
 *
 * **Today is the furthest the calendar goes forward.** The ‹ / › controls stop
 * at the current month or week, a hand-typed future anchor is pulled back to
 * today, and days that have not happened yet are not links — there is nothing
 * to look at and nothing to correct (owner request, 2026-10-03).
 */
export function CalendarRoute() {
  const params = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const today = todayIso()
  const view: CalendarView = params.view === 'week' ? 'week' : 'month'
  // Anchor date: the segment after the view. Month uses YYYY-MM; week uses any
  // ISO date inside the target week.
  const requested =
    typeof params.anchor === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(params.anchor)
      ? params.anchor
      : today
  // Clamped before anything else reads it, so the URL cannot push the calendar
  // into a month or week that has not arrived.
  const anchor =
    view === 'week'
      ? clampWeekAnchorToToday(requested.length === 7 ? `${requested}-01` : requested, today)
      : clampMonthToToday(requested.length === 7 ? requested : monthForIso(requested), today)

  // Normalise to a fetchable range.
  const range = view === 'week' ? weekRange(anchor) : monthGridRange(anchor)

  const monthKey = view === 'month' ? anchor : monthForIso(today)
  const weekAnchorIso = view === 'week' ? anchor : today

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

  /** The period being viewed is the one containing today, so › has nowhere to go. */
  const atLeadingPeriod =
    view === 'month' ? monthKey >= monthForIso(today) : range.from >= weekRange(today).from

  const goMonth = (direction: -1 | 1) => {
    // `addMonths` answers with a date; the month route is keyed by `YYYY-MM`,
    // so keep the URL in the shape the docs promise.
    const next = clampMonthToToday(monthForIso(addMonths(monthKey, direction)), today)
    if (next === monthKey) return
    navigate(`/calendar/month/${next}${searchParams.size ? `?${searchParams}` : ''}`)
  }

  const goWeek = (direction: -1 | 1) => {
    const next = clampWeekAnchorToToday(addDays(weekAnchorIso, direction * 7), today)
    if (weekRange(next).from === range.from) return
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
          disabled={atLeadingPeriod}
          title={atLeadingPeriod ? 'Today is the furthest day you can look at yet' : undefined}
          className="min-h-11 min-w-11 rounded-xl bg-card border border-line text-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
        <MonthGrid days={buildGrid(range.from, range.to, dayByDate)} from={range.from} today={today} />
      )}
      {calendar.data && view === 'week' && (
        <WeekList days={buildWeek(range.from, range.to, dayByDate)} today={today} />
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

/**
 * A day's calorie bar: green while the goal covers the day, and a red tail for
 * the overspend. Under goal the bar simply fills towards the right, so a
 * finished day and a blown-out day are still easy to tell apart at a glance.
 */
function CalorieBar({ day, trackClass }: { day: CalendarDay; trackClass: string }) {
  const { greenPct, redPct } = calorieBarSplit(day.calories, day.goal)
  return (
    <div
      data-calorie-bar
      className={`flex w-full overflow-hidden rounded-full bg-line-light ${trackClass}`}
      aria-hidden
    >
      <div data-segment="within-goal" className="h-full bg-success" style={{ width: `${greenPct}%` }} />
      {redPct > 0 && (
        <div data-segment="overspend" className="h-full bg-danger" style={{ width: `${redPct}%` }} />
      )}
    </div>
  )
}

function MonthGrid({
  days,
  from,
  today,
}: {
  days: CalendarDay[]
  from: string
  today: string
}) {
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
          <MonthCell
            key={day.date}
            day={day}
            inMonth={day.date.slice(0, 7) === monthOfFirst}
            future={isFutureDay(day.date, today)}
          />
        ))}
      </div>
      <Legend />
    </section>
  )
}

function MonthCell({ day, inMonth, future }: { day: CalendarDay; inMonth: boolean; future: boolean }) {
  const hydr = hydrationRatio(day.hydration_ml, day.hydration_target_ml)
  const classes = [
    'relative min-h-[72px] rounded-lg border p-1.5 text-left text-ink transition-colors',
    day.is_today ? 'border-primary ring-1 ring-primary/40' : 'border-line-light',
    inMonth ? 'bg-surface' : 'bg-transparent opacity-40',
    // A day that has not happened has no diary to open, so it is inert.
    future ? 'opacity-40' : 'no-underline cursor-pointer hover:border-primary',
  ].join(' ')
  const label = `${day.date}: ${formatNumber(Math.round(day.calories))} kcal of ${formatNumber(day.goal)}, bank ${day.bank_balance >= 0 ? '+' : ''}${formatNumber(day.bank_balance)} kcal`

  const content = (
    <>
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
          <div className="mt-1">
            <CalorieBar day={day} trackClass="h-1.5" />
          </div>
          <p className="m-0 mt-1 text-[0.6rem] tabular-nums leading-tight text-ink-light">
            {bankLabel(day.bank_balance)}
          </p>
        </>
      )}
    </>
  )

  return future ? (
    <div className={classes} aria-label={`${label} — not yet`}>
      {content}
    </div>
  ) : (
    <Link to={`/diary/${day.date}`} className={classes} aria-label={label}>
      {content}
    </Link>
  )
}

function WeekList({ days, today }: { days: CalendarDay[]; today: string }) {
  return (
    <div className="flex flex-col gap-2">
      {days.map((day) => (
        <WeekDayCard key={day.date} day={day} future={isFutureDay(day.date, today)} />
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

function WeekDayCard({ day, future }: { day: CalendarDay; future: boolean }) {
  const dow = new Date(`${day.date}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    timeZone: 'UTC',
  })
  const domLabel = new Date(`${day.date}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
  const over = day.calories > day.goal
  const hydr = hydrationRatio(day.hydration_ml, day.hydration_target_ml)

  const className = [
    'block rounded-2xl bg-card p-3 shadow-card text-ink',
    day.is_today ? 'ring-2 ring-primary/50' : '',
    future ? 'opacity-55' : 'no-underline cursor-pointer',
  ].join(' ')

  const content = (
    <>
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <p className={`m-0 text-sm font-semibold ${day.is_today ? 'text-primary-dark' : ''}`}>
            {dow}
            {day.is_today && <span className="ml-1 text-[0.65rem] font-medium text-primary">Today</span>}
            {future && <span className="ml-1 text-[0.65rem] font-medium text-ink-muted">Upcoming</span>}
          </p>
          <p className="m-0 text-xs text-ink-light">{domLabel}</p>
        </div>
        <div className="text-right">
          <p className={`m-0 text-sm font-semibold tabular-nums ${over ? 'text-danger' : ''}`}>
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

      <div className="mt-2">
        <CalorieBar day={day} trackClass="h-2" />
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

      {future ? (
        <p className="m-0 mt-2 text-xs text-ink-muted">This day hasn’t happened yet.</p>
      ) : (
        !day.has_data && (
          <p className="m-0 mt-2 text-xs text-ink-muted">Nothing logged yet — tap to open this day.</p>
        )
      )}
    </>
  )

  return future ? (
    <div className={className}>{content}</div>
  ) : (
    <Link to={`/diary/${day.date}`} className={className} aria-label={`Open diary for ${dow} ${domLabel}`}>
      {content}
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
      <span className="inline-block h-1.5 w-4 align-middle rounded-full bg-success mr-1" /> within goal
      <span className="mx-1.5">·</span>
      <span className="inline-block h-1.5 w-1.5 align-middle rounded-full bg-danger mr-1" /> the red
      tail is the overspend
      <span className="mx-1.5">·</span>
      tap any past day to open its diary
    </p>
  )
}
