import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, queryKeys } from '../api/client'
import { getCalendar } from '../api/calendar'
import type { CalendarResponse, WeeklyAnalysis, WeeklyReportSeenResponse, WeightEntry } from '../api/types'
import { StatusLight } from './StatusLight'
import { addDays, formatNumber, formatShortDate, todayIso } from '../lib/format'
import { formatWeekRangeLabel, weekRange } from '../lib/calendar'
import {
  REPORT_PARAM_NAMES,
  currentWeekRange,
  readReportRange,
  reportParams,
  summariseReport,
  type ReportRange,
} from '../lib/report'

/**
 * Weekly report (Phase 14.6, decision 46).
 *
 * A card in Metrics that answers "how did last week go": calories against the
 * goal, how the bank moved, water, weight change, the nutrition traffic lights,
 * the best and worst days, and — decision 42's rule — the days excluded as
 * unlogged, named so the exclusions are never quietly unexplained. In-app
 * only: no email, no push.
 *
 * Decisions 107–109 settle the shape. The card pages one week at a time (‹ ›,
 * opening on the current week — decision 108) with a **Custom** mode for a free
 * date range. Its window rides in the URL under `report_*` names because
 * `from`/`to` already drive the pannable charts on this route (decision 69).
 * "Best" and "worst" are the logged days closest to and furthest from the daily
 * goal, either side, labelled with their delta (decision 109).
 *
 * Everything here is presentation over data the other slices already produce:
 * the Calendar endpoint supplies each day's food + drink calories, hydration
 * and closing bank balance (the same `computeBankWindow` the tile uses), the
 * nutrition analysis supplies the traffic lights for the chosen range (the
 * from/to support the handler gained in this slice), and `/api/weight` supplies
 * the weigh-ins. No bank maths is re-derived here.
 */

/** How far back a weigh-in is carried forward to open the period's change. */
const WEIGHT_LOOKBACK_DAYS = 90

/** Long custom ranges summarise their unlogged days rather than listing dozens. */
const MAX_LISTED_EXCLUDED_DAYS = 10

export function WeeklyReport() {
  const [searchParams, setSearchParams] = useSearchParams()
  const today = todayIso()
  const range = useMemo(() => readReportRange(searchParams, today), [searchParams, today])

  const [draftFrom, setDraftFrom] = useState(range.from)
  const [draftTo, setDraftTo] = useState(range.to)
  const [customError, setCustomError] = useState<string | null>(null)

  // The opening balance is the previous day's closing balance, so the calendar
  // range starts one day before the report's first day (slice 14.2's rule).
  const calendarFrom = addDays(range.from, -1)
  const calendar = useQuery<CalendarResponse>({
    queryKey: queryKeys.calendar(calendarFrom, range.to),
    queryFn: () => getCalendar(calendarFrom, range.to),
  })

  // The from/to picker added to this endpoint in slice 14.6, so the traffic
  // lights describe the chosen range rather than a window ending today.
  const nutrition = useQuery<WeeklyAnalysis>({
    queryKey: queryKeys.nutritionRange(range.from, range.to),
    queryFn: () =>
      apiGet<WeeklyAnalysis>(`/api/nutrition/weekly?from=${range.from}&to=${range.to}`),
  })

  const weightFrom = addDays(range.from, -WEIGHT_LOOKBACK_DAYS)
  const weights = useQuery<WeightEntry[]>({
    queryKey: queryKeys.weightRange(weightFrom, range.to),
    queryFn: ({ signal }) => apiGet<WeightEntry[]>(`/api/weight?from=${weightFrom}&to=${range.to}`, { signal }),
  })

  const summary = useMemo(
    () =>
      summariseReport({
        days: calendar.data?.days ?? [],
        from: range.from,
        to: range.to,
        weights: weights.data ?? [],
      }),
    [calendar.data, range.from, range.to, weights.data],
  )

  // Decision 121: a completed period that is actually on screen counts as
  // viewed — that is what clears the bell's "weekly report ready" advisory,
  // on every device (the watermark lives server-side). The in-progress week
  // never posts: a report is complete when its week has finished. The ref
  // keeps re-renders from repeating the POST, and the endpoint is idempotent
  // (the watermark only moves forward) regardless.
  const queryClient = useQueryClient()
  const markedSeenRef = useRef<string | null>(null)
  useEffect(() => {
    if (range.to >= today || markedSeenRef.current === range.to) return
    markedSeenRef.current = range.to
    void apiPost<WeeklyReportSeenResponse>('/api/reminders/weekly-report-seen', { week_to: range.to })
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.reminders })
      })
      .catch(() => {
        // Bookkeeping only — on failure the advisory simply waits for the next
        // view of a completed report.
      })
  }, [range.to, today, queryClient])

  const setRange = (next: ReportRange) => {
    setCustomError(null)
    setSearchParams(
      (params) => {
        const updated = new URLSearchParams(params)
        for (const name of REPORT_PARAM_NAMES) updated.delete(name)
        const nextParams = reportParams(next, today)
        if (nextParams) {
          for (const [name, value] of Object.entries(nextParams)) updated.set(name, value)
        }
        return updated
      },
      { replace: true },
    )
    if (next.mode === 'custom') {
      setDraftFrom(next.from)
      setDraftTo(next.to)
    }
  }

  const currentView = currentWeekRange(today)
  const atCurrentWeek = range.mode === 'week' && range.from >= currentView.from

  const goWeek = (direction: -1 | 1) => {
    const week = weekRange(addDays(range.from, direction * 7))
    setRange({ mode: 'week', from: week.from, to: week.to > today ? today : week.to })
  }

  const switchToCustom = () => {
    setDraftFrom(range.from)
    setDraftTo(range.to)
    setRange({ mode: 'custom', from: range.from, to: range.to })
  }

  const applyCustom = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draftFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(draftTo)) {
      setCustomError('Enter both dates.')
      return
    }
    if (draftTo < draftFrom) {
      setCustomError('The start date must be on or before the end date.')
      return
    }
    // readReportRange clamps a future end to today and a span past the API's
    // 400-day bound, so the request can never be one the server refuses.
    const applied = readReportRange(
      new URLSearchParams({ report: 'custom', report_from: draftFrom, report_to: draftTo }),
      today,
    )
    setDraftFrom(applied.from)
    setDraftTo(applied.to)
    setRange(applied)
  }

  const data = calendar.data
  // A one-day window (the week so far, on a Monday) would read "5 – 5 Oct".
  const rangeLabel = `${
    range.from === range.to ? formatShortDate(range.from) : formatWeekRangeLabel(range.from, range.to)
  }${range.to === today ? ' · so far' : ''}`
  const bankWindow = calendar.data?.bank_window_days

  return (
    <section data-testid="weekly-report" className="rounded-2xl bg-card p-4 shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-base font-semibold">📋 Weekly report</h2>
        <div className="flex gap-1 rounded-full border border-line bg-surface p-0.5">
          <ModeTab
            active={range.mode === 'week'}
            onClick={() => setRange({ mode: 'week', from: currentView.from, to: currentView.to })}
            label="Week"
            testId="report-mode-week"
          />
          <ModeTab active={range.mode === 'custom'} onClick={switchToCustom} label="Custom" testId="report-mode-custom" />
        </div>
      </header>

      {range.mode === 'week' ? (
        <nav className="mt-3 flex items-center justify-between gap-2" aria-label="Report week">
          <button
            type="button"
            data-testid="report-prev"
            onClick={() => goWeek(-1)}
            aria-label="Previous week"
            className="min-h-11 min-w-11 cursor-pointer rounded-xl border border-line bg-card text-lg"
          >
            ‹
          </button>
          <p data-testid="report-range" className="m-0 text-sm font-medium text-ink">
            {rangeLabel}
          </p>
          <button
            type="button"
            data-testid="report-next"
            onClick={() => goWeek(1)}
            disabled={atCurrentWeek}
            aria-label="Next week"
            className="min-h-11 min-w-11 cursor-pointer rounded-xl border border-line bg-card text-lg disabled:cursor-default disabled:opacity-40"
          >
            ›
          </button>
        </nav>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-ink-light">
              From
              <input
                type="date"
                data-testid="report-from"
                value={draftFrom}
                max={today}
                onChange={(event) => setDraftFrom(event.target.value)}
                className="min-h-11 rounded-xl border border-line bg-card px-2 text-sm text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-light">
              To
              <input
                type="date"
                data-testid="report-to"
                value={draftTo}
                max={today}
                onChange={(event) => setDraftTo(event.target.value)}
                className="min-h-11 rounded-xl border border-line bg-card px-2 text-sm text-ink"
              />
            </label>
            <button
              type="button"
              data-testid="report-apply"
              onClick={applyCustom}
              className="min-h-11 cursor-pointer rounded-xl bg-primary px-4 text-sm font-semibold text-white"
            >
              Show range
            </button>
          </div>
          <p data-testid="report-range" className="m-0 text-sm font-medium text-ink">
            {rangeLabel} · {summary.rangeDays} {summary.rangeDays === 1 ? 'day' : 'days'}
          </p>
          {customError && (
            <p className="m-0 text-sm text-danger" role="alert">
              {customError}
            </p>
          )}
        </div>
      )}

      {calendar.isPending ? (
        <p className="mt-3 text-sm text-ink-light">Loading…</p>
      ) : !data || summary.rangeDays === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">No days in this range yet.</p>
      ) : (
        <>
          <p data-testid="report-logged-line" className="m-0 mt-3 text-xs text-ink-light">
            {summary.loggedDays.length} of {summary.rangeDays} {summary.rangeDays === 1 ? 'day' : 'days'} logged
            {summary.excludedDays.length > 0 && ` · ${summary.excludedDays.length} excluded as unlogged`}
          </p>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <ReportStat
              label="Calories"
              testId="report-calories"
              value={`${formatNumber(summary.totalCalories)} kcal`}
              sub={
                summary.loggedDays.length
                  ? `avg ${formatNumber(summary.averageCalories)}/day vs goal ${formatNumber(summary.goalPerDay)} · ${summary.daysOver} over, ${summary.daysUnder} under`
                  : 'Nothing logged in this range'
              }
            />
            <ReportStat
              label="Bank"
              testId="report-bank"
              value={summary.bank ? `${summary.bank.movement >= 0 ? '+' : ''}${formatNumber(summary.bank.movement)} kcal` : '—'}
              sub={
                summary.bank
                  ? `from ${signedKcal(summary.bank.opening)} to ${signedKcal(summary.bank.closing)}${bankWindowPhraseSuffix(bankWindow)}`
                  : 'No bank data'
              }
              tone={summary.bank ? (summary.bank.movement >= 0 ? 'success' : 'danger') : undefined}
            />
            <ReportStat
              label="💧 Water"
              testId="report-water"
              value={`${(summary.hydration.totalMl / 1000).toFixed(1)} L`}
              sub={
                summary.hydration.targetMl > 0
                  ? `${summary.hydration.daysMetTarget} of ${summary.loggedDays.length} logged days met ${(summary.hydration.targetMl / 1000).toFixed(1)} L`
                  : 'No hydration target set'
              }
            />
            <ReportStat
              label="⚖️ Weight"
              testId="report-weight"
              value={summary.weight ? `${summary.weight.changeKg >= 0 ? '+' : ''}${summary.weight.changeKg.toFixed(1)} kg` : '—'}
              sub={
                summary.weight
                  ? `${summary.weight.startKg.toFixed(1)} → ${summary.weight.endKg.toFixed(1)} kg · weigh-ins ${formatShortDate(summary.weight.startDate)}–${formatShortDate(summary.weight.endDate)}`
                  : 'No weigh-in in this period'
              }
              tone={summary.weight ? (summary.weight.changeKg <= 0 ? 'success' : 'danger') : undefined}
            />
          </div>

          <BestWorst summary={summary} />

          <div data-testid="report-lights" className="mt-3">
            <h3 className="m-0 mb-2 text-sm font-semibold text-ink-light">Traffic lights this range</h3>
            {nutrition.isPending ? (
              <p className="m-0 text-sm text-ink-light">Loading…</p>
            ) : nutrition.data && summary.loggedDays.length ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <StatusLight
                    label="Protein"
                    light={nutrition.data.status.protein}
                    value={`${nutrition.data.averages.protein.toFixed(0)} g`}
                    sub={`${nutrition.data.averages.protein_per_kg.toFixed(2)} g/kg · goal ${nutrition.data.settings.protein_goal_per_kg}`}
                  />
                  <StatusLight
                    label="Carbs"
                    light={nutrition.data.status.carbs}
                    value={`${nutrition.data.averages.carbs_percent.toFixed(0)}%`}
                    sub={`target ${nutrition.data.settings.carb_min_percent}–${nutrition.data.settings.carb_max_percent}%`}
                  />
                  <StatusLight
                    label="Fat"
                    light={nutrition.data.status.fat}
                    value={`${nutrition.data.averages.fat_percent.toFixed(0)}%`}
                    sub={`max ${nutrition.data.settings.fat_max_percent}%`}
                  />
                  <StatusLight
                    label="Fibre"
                    light={nutrition.data.status.fibre}
                    value={`${nutrition.data.averages.fibre.toFixed(0)} g`}
                    sub={`goal ${nutrition.data.settings.fibre_goal} g`}
                  />
                </div>
                <p className="m-0 mt-1 text-xs text-ink-muted">
                  Averages over {nutrition.data.days_with_data} day{nutrition.data.days_with_data === 1 ? '' : 's'} with food data.
                </p>
              </>
            ) : (
              <p className="m-0 text-sm text-ink-muted">No food logged in this range.</p>
            )}
          </div>

          <p data-testid="report-excluded" className="m-0 mt-3 text-xs text-ink-muted">
            {summary.excludedDays.length === 0
              ? 'Every day in this range was logged.'
              : `Excluded as unlogged: ${excludedLabel(summary.excludedDays.map((day) => day.date))}`}
          </p>
        </>
      )}
    </section>
  )
}

function excludedLabel(dates: string[]): string {
  const shown = dates.slice(0, MAX_LISTED_EXCLUDED_DAYS).map((date) => formatShortDate(date))
  const rest = dates.length - shown.length
  return rest > 0 ? `${shown.join(', ')} and ${rest} more` : shown.join(', ')
}

function signedKcal(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatNumber(value)} kcal`
}

/** The bank card names the window its figures cover (decisions 66, 92). */
function bankWindowPhraseSuffix(windowDays: number | undefined): string {
  if (windowDays === undefined || windowDays === null || !Number.isFinite(windowDays)) return ''
  return windowDays <= 0 ? ' · all time' : windowDays === 1 ? ' · last day window' : ` · last ${windowDays} day window`
}

function BestWorst({ summary }: { summary: ReturnType<typeof summariseReport> }) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
      <EdgeDay label="Best day" testId="report-best" day={summary.bestDay} />
      <EdgeDay label="Worst day" testId="report-worst" day={summary.worstDay} />
    </div>
  )
}

function EdgeDay({
  label,
  testId,
  day,
}: {
  label: string
  testId: string
  day: ReturnType<typeof summariseReport>['bestDay']
}) {
  if (!day) {
    return (
      <div data-testid={testId} className="rounded-xl border border-line-light px-3 py-2">
        <p className="m-0 text-xs text-ink-light">{label}</p>
        <p className="m-0 text-sm text-ink-muted">No logged day in this range</p>
      </div>
    )
  }
  return (
    <div data-testid={testId} className="rounded-xl border border-line-light px-3 py-2">
      <p className="m-0 text-xs text-ink-light">{label}</p>
      <p className="m-0 text-sm font-medium text-ink">
        {formatShortDate(day.date)} · {formatNumber(day.day.calories)} kcal
      </p>
      <p className="m-0 text-xs text-ink-light">
        {day.delta === 0
          ? 'on goal'
          : `${formatNumber(Math.abs(day.delta))} kcal ${day.delta > 0 ? 'over' : 'under'} goal`}
      </p>
    </div>
  )
}

function ReportStat({
  label,
  value,
  sub,
  tone,
  testId,
}: {
  label: string
  value: string
  sub: string
  tone?: 'success' | 'danger'
  testId: string
}) {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-ink'
  return (
    <div data-testid={testId} className="rounded-xl border border-line-light px-3 py-2">
      <p className="m-0 text-xs text-ink-light">{label}</p>
      <p className={`m-0 font-semibold ${toneClass}`}>{value}</p>
      <p className="m-0 text-xs text-ink-light">{sub}</p>
    </div>
  )
}

function ModeTab({
  active,
  onClick,
  label,
  testId,
}: {
  active: boolean
  onClick: () => void
  label: string
  testId: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`min-h-9 cursor-pointer rounded-full px-3 text-xs font-medium ${
        active ? 'bg-primary text-white' : 'text-ink-light'
      }`}
    >
      {label}
    </button>
  )
}
