import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPut, queryKeys } from '../api/client'
import type {
  BodyOutline,
  DailyBank,
  DailyCalories,
  MeasurementEntry,
  MeasurementLatest,
  MeasurementPartKey,
  TrafficLight,
  User,
  WeeklyAnalysis,
  WeightEntry,
} from '../api/types'
import { BarChart, LineChart } from '../components/charts'
import { BodyMap } from '../components/BodyMap'
import { MeasurementSheet } from '../components/MeasurementSheet'
import { MeasurementEditSheet } from '../components/MeasurementEditSheet'
import { usePanWindow } from '../hooks/usePanWindow'
import { bankWindowPhrase } from '../lib/bank'
import { movingAverageOverWeighIns } from '../lib/trend'
import {
  addDays,
  formatKg,
  formatNumber,
  formatShortDate,
  formatStonesPounds,
  kgToStonesPounds,
  todayIso,
} from '../lib/format'
import {
  MEASUREMENT_OVERDUE_DAYS,
  daysBetweenIso,
  labelFor,
  latestMeasurementDate,
} from '../lib/measurements'

export function MetricsRoute() {
  // The weigh-in chart and the goal-vs-consumed chart share one pannable
  // window (decision 69); the bank line and the measurements section below
  // keep their own fixed windows (decision 95's third implementation note).
  const pan = usePanWindow(30)
  const queryClient = useQueryClient()

  // The summary tiles always describe now, so they keep the fixed 90-day
  // fetch even when the chart above them has been panned into the past.
  const weight = useQuery<WeightEntry[]>({
    queryKey: queryKeys.weight(90),
    queryFn: () => apiGet<WeightEntry[]>('/api/weight?days=90'),
  })

  const weightWindow = useQuery<WeightEntry[]>({
    queryKey: queryKeys.weightRange(pan.from, pan.to),
    queryFn: () => apiGet<WeightEntry[]>(`/api/weight?from=${pan.from}&to=${pan.to}`),
  })

  const calories = useQuery<DailyCalories[]>({
    queryKey: queryKeys.calorieStatsRange(pan.from, pan.to),
    queryFn: () => apiGet<DailyCalories[]>(`/api/stats/calories?from=${pan.from}&to=${pan.to}`),
  })

  const bank = useQuery<DailyBank[]>({
    queryKey: queryKeys.bankStats(30),
    queryFn: () => apiGet<DailyBank[]>('/api/stats/bank?days=30'),
  })

  // The history table asks for the widest window the endpoint allows; the
  // body map's pop-up reads the dedicated latest-per-part lookup instead,
  // which no row limit can defeat (slice 14.4).
  const historyFrom = addDays(todayIso(), -399)
  const measurements = useQuery<MeasurementEntry[]>({
    queryKey: queryKeys.measurementsRange(historyFrom, todayIso()),
    queryFn: () => apiGet<MeasurementEntry[]>(`/api/measurements?from=${historyFrom}&to=${todayIso()}`),
  })

  const measurementLatest = useQuery<MeasurementLatest>({
    queryKey: queryKeys.measurementsLatest,
    queryFn: () => apiGet<MeasurementLatest>('/api/measurements/latest'),
  })

  const nutrition = useQuery<WeeklyAnalysis>({
    queryKey: queryKeys.nutrition(7),
    queryFn: () => apiGet<WeeklyAnalysis>('/api/nutrition/weekly?days=7'),
  })

  const user = useQuery<User>({
    queryKey: queryKeys.user,
    queryFn: () => apiGet<User>('/api/users/me'),
  })

  const [recordingPart, setRecordingPart] = useState<MeasurementPartKey | null>(null)
  const [editingEntry, setEditingEntry] = useState<MeasurementEntry | null>(null)

  const chooseOutline = useMutation({
    mutationFn: (outline: BodyOutline) => apiPut<User>('/api/users/me', { body_outline: outline }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.user })
    },
  })

  // API returns newest-first; charts want oldest-first.
  const weightAsc = useMemo(() => [...(weight.data ?? [])].sort((a, b) => a.date.localeCompare(b.date)), [weight.data])
  const inView = useMemo(
    () => [...(weightWindow.data ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
    [weightWindow.data],
  )

  const latest = weightAsc.at(-1)
  const monthAgo = weightAsc.find((entry) => entry.date >= addDaysIso(weightAsc.at(-1)?.date ?? '', -30))
  const change = latest && monthAgo ? latest.weight_kg - monthAgo.weight_kg : 0

  const latestWaist = measurementLatest.data?.waist_cm ?? null
  const target = user.data?.target_weight_kg
  // Every bank figure is a rolling window (decisions 66, 92); this chart prints
  // one per day, so it says which window those balances are computed over.
  const bankWindow = bankWindowPhrase(user.data?.bank_window_days)

  // The trend window is read from the user record, never hard-coded: Phase 15
  // will expose it in Settings, and a chart that ignored the column would make
  // that control look broken (decision 95).
  const trendWindow = user.data?.weight_trend_days ?? 7
  const trend = useMemo(
    () => movingAverageOverWeighIns(inView.map((entry) => entry.weight_kg), trendWindow),
    [inView, trendWindow],
  )
  const trendDrawn = inView.length >= 3
  const hasCalories = (calories.data ?? []).some((day) => day.calories > 0)

  const outline = user.data?.body_outline ?? null
  const lastMeasured = measurementLatest.data ? latestMeasurementDate(measurementLatest.data) : null
  const daysSinceMeasured = lastMeasured ? daysBetweenIso(lastMeasured, todayIso()) : null
  const overdue = daysSinceMeasured !== null && daysSinceMeasured > MEASUREMENT_OVERDUE_DAYS
  const weeksSince = daysSinceMeasured === null ? null : Math.floor(daysSinceMeasured / 7)

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl bg-card p-4 shadow-card">
        <h2 className="m-0 mb-3 text-base font-semibold">⚖️ Weight</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Current" value={latest ? formatStonesPounds(latest.weight_kg) : '—'} sub={latest ? formatKg(latest.weight_kg) : ''} />
          <Stat
            label="Last 30 days"
            value={`${change <= 0 ? '' : '+'}${kgToStonesPounds(Math.abs(change)).stones === 0 ? `${(Math.abs(change) * 2.2046).toFixed(1)} lb` : `${kgToStonesPounds(Math.abs(change)).stones} st ${kgToStonesPounds(Math.abs(change)).pounds} lb`}`}
            sub={`${change <= 0 ? '' : '+'}${change.toFixed(1)} kg`}
            tone={change <= 0 ? 'success' : 'danger'}
          />
          <Stat label="Target" value={target ? formatStonesPounds(target) : 'Not set'} sub={target ? formatKg(target) : ''} />
          <Stat
            label="Waist"
            value={latestWaist ? `${latestWaist.value.toFixed(1)} cm` : '—'}
            sub={latestWaist ? formatShortDate(latestWaist.date) : ''}
          />
        </div>

        <div
          data-testid="weight-pan"
          onPointerDown={pan.onPointerDown}
          className={`mt-4 touch-pan-y select-none ${pan.panning ? 'cursor-grabbing' : 'cursor-grab'}`}
        >
          {weightWindow.isPending ? (
            <p className="text-sm text-ink-light">Loading…</p>
          ) : (
            <LineChart
              points={inView.map((entry) => ({ label: formatShortDate(entry.date), value: entry.weight_kg }))}
              valueLabel={(value) => formatStonesPounds(value)}
              // Points stay points and the trend is a separate, labelled
              // average (decision 95); 2 kg of y-axis keeps a small wobble
              // from filling the chart (decision 70).
              dots
              trend={trendDrawn ? trend : undefined}
              minSpan={2}
              ariaLabel="Weigh-ins with trend"
            />
          )}
        </div>
        <p data-testid="weight-window" className="m-0 mt-1 text-xs text-ink-muted">
          Showing {formatShortDate(pan.from)} – {formatShortDate(pan.to)} · drag the chart to move the window.
        </p>
        <p data-testid="weight-trend-note" className="m-0 mt-0.5 text-xs text-ink-muted">
          {trendDrawn
            ? `Dots are individual weigh-ins; the dashed line is a ${trendWindow}-weigh-in moving average.`
            : `A trend needs at least three weigh-ins in view; keep panning back for older ones.`}
        </p>
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-card">
        <h2 className="m-0 mb-1 text-base font-semibold">🔥 Daily goal vs consumed</h2>
        <p data-testid="goal-window" className="m-0 mb-3 text-xs text-ink-muted">
          {formatShortDate(pan.from)} – {formatShortDate(pan.to)} · green below goal, amber to 10% over, red beyond. Drag to pan.
        </p>
        <div
          data-testid="goal-pan"
          onPointerDown={pan.onPointerDown}
          className={`touch-pan-y select-none ${pan.panning ? 'cursor-grabbing' : 'cursor-grab'}`}
        >
          {calories.isPending ? (
            <p className="text-sm text-ink-light">Loading…</p>
          ) : hasCalories ? (
            <BarChart
              points={(calories.data ?? []).map((day) => ({ label: formatShortDate(day.date), value: day.calories }))}
              goal={calories.data?.[0]?.goal}
              accent="#26de81"
              bands
            />
          ) : (
            // Panned back past the start of the diary this says so, rather than
            // drawing a row of invisible zero-height bars.
            <p className="text-sm text-ink-muted">Nothing logged in this window — keep panning forward.</p>
          )}
        </div>
        <p className="m-0 mt-1 text-xs text-ink-muted">
          Food and drink calories together, so the bars agree with today's ring.
        </p>
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-card">
        <h2 className="m-0 mb-3 text-base font-semibold">🏦 Calorie bank (30 days)</h2>
        {bank.isPending ? (
          <p className="text-sm text-ink-light">Loading…</p>
        ) : (
          <LineChart
            points={(bank.data ?? []).map((day) => ({ label: formatShortDate(day.date), value: day.balance }))}
            stroke={((bank.data ?? []).at(-1)?.balance ?? 0) >= 0 ? '#26de81' : '#fc5c65'}
            valueLabel={(value) => `${value >= 0 ? '+' : ''}${formatNumber(value)} kcal`}
          />
        )}
        <p data-testid="bank-window-note" className="m-0 mt-1 text-xs text-ink-muted">
          {bankWindow ? `Each day is that day's closing balance, computed over ${bankWindow}.` : "Each day is that day's closing balance."}
        </p>
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-card">
        <h2 className="m-0 mb-1 text-base font-semibold">🥗 Nutrition — 7 day rolling</h2>
        <p className="m-0 mb-3 text-xs text-ink-light">
          {nutrition.data ? `${nutrition.data.days_with_data} days with data · avg ${formatNumber(nutrition.data.averages.calories)} kcal/day` : ''}
        </p>
        {nutrition.isPending ? (
          <p className="text-sm text-ink-light">Loading…</p>
        ) : nutrition.data ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Light label="Protein" light={nutrition.data.status.protein} value={`${nutrition.data.averages.protein.toFixed(0)} g`} sub={`${nutrition.data.averages.protein_per_kg.toFixed(1)} g/kg (goal ${nutrition.data.settings.protein_goal_per_kg})`} />
            <Light label="Carbs" light={nutrition.data.status.carbs} value={`${nutrition.data.averages.carbs_percent.toFixed(0)}%`} sub={`target ${nutrition.data.settings.carb_min_percent}–${nutrition.data.settings.carb_max_percent}%`} />
            <Light label="Fat" light={nutrition.data.status.fat} value={`${nutrition.data.averages.fat_percent.toFixed(0)}%`} sub={`max ${nutrition.data.settings.fat_max_percent}%`} />
            <Light label="Fibre" light={nutrition.data.status.fibre} value={`${nutrition.data.averages.fibre.toFixed(0)} g`} sub={`goal ${nutrition.data.settings.fibre_goal} g`} />
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-card">
        <h2 className="m-0 mb-1 text-base font-semibold">📏 Measurements</h2>

        {lastMeasured === null ? (
          <p data-testid="measurement-staleness" className="m-0 mb-3 text-xs text-ink-muted">
            No measurements logged yet — tap a point on the map to record your first.
          </p>
        ) : (
          <p
            data-testid="measurement-staleness"
            className={`m-0 mb-3 text-xs ${overdue ? 'font-medium text-amber-600' : 'text-ink-muted'}`}
          >
            Last measured {formatShortDate(lastMeasured)}
            {weeksSince !== null &&
              (weeksSince === 0
                ? ' · this week'
                : ` · ${weeksSince} week${weeksSince === 1 ? '' : 's'} ago`)}
            {overdue && ' — measurements are best taken every 3–4 weeks'}
          </p>
        )}

        {outline === null ? (
          // Decision 97: the outline is a per-user preference with no assumed
          // default — the first visit asks once, then remembers.
          <div data-testid="outline-picker" className="flex flex-col gap-2 py-2">
            <p className="m-0 text-sm text-ink-light">
              Choose the outline that fits you — it decides which points the body map shows.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="outline-female"
                onClick={() => chooseOutline.mutate('female')}
                disabled={chooseOutline.isPending}
                className="min-h-11 flex-1 cursor-pointer rounded-xl border border-line bg-card text-sm font-semibold text-ink"
              >
                Female outline
              </button>
              <button
                type="button"
                data-testid="outline-male"
                onClick={() => chooseOutline.mutate('male')}
                disabled={chooseOutline.isPending}
                className="min-h-11 flex-1 cursor-pointer rounded-xl border border-line bg-card text-sm font-semibold text-ink"
              >
                Male outline
              </button>
            </div>
          </div>
        ) : measurementLatest.data ? (
          <>
            <BodyMap outline={outline} latest={measurementLatest.data} onPick={setRecordingPart} />
            <p className="m-0 mt-2 text-center text-xs text-ink-muted">
              Tap a point to record or check that measurement. Filled dots have a value; hollow ones
              have never been measured.
            </p>
          </>
        ) : null}

        <h3 className="m-0 mt-4 mb-2 text-sm font-semibold text-ink-light">History</h3>
        {measurements.isPending ? (
          <p className="text-sm text-ink-light">Loading…</p>
        ) : (measurements.data ?? []).length === 0 ? (
          <p className="text-sm text-ink-muted m-0">No measurements logged.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0" data-testid="measurement-history">
            {(measurements.data ?? []).map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  data-testid="measurement-history-row"
                  onClick={() => setEditingEntry(row)}
                  aria-label={`Edit measurements recorded ${formatShortDate(row.date)}`}
                  className="flex w-full cursor-pointer flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-line-light bg-surface px-3 py-2 text-left text-sm"
                >
                  <span className="font-medium text-ink">{formatShortDate(row.date)}</span>
                  {PART_ORDER.filter((key) => row[key] !== null).map((key) => (
                    <span key={key} className="text-xs text-ink-light tabular-nums">
                      {labelFor(key)} {(row[key] as number).toFixed(1)}
                    </span>
                  ))}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {recordingPart && measurementLatest.data && (
        <MeasurementSheet
          part={recordingPart}
          latest={measurementLatest.data[recordingPart]}
          onClose={() => setRecordingPart(null)}
        />
      )}
      {editingEntry && <MeasurementEditSheet entry={editingEntry} onClose={() => setEditingEntry(null)} />}
    </div>
  )
}

/** History rows list parts top-down, whichever outline recorded them. */
const PART_ORDER = [
  'neck_cm',
  'chest_cm',
  'bust_cm',
  'waist_cm',
  'upper_arm_cm',
  'hips_cm',
  'thigh_cm',
] as const

function addDaysIso(iso: string, delta: number): string {
  if (!iso) return iso
  const date = new Date(`${iso}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + delta)
  return date.toISOString().slice(0, 10)
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'success' | 'danger' }) {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-ink'
  return (
    <div className="rounded-xl border border-line-light px-3 py-2">
      <p className="m-0 text-xs text-ink-light">{label}</p>
      <p className={`m-0 font-semibold ${toneClass}`}>{value}</p>
      <p className="m-0 text-xs text-ink-light">{sub}</p>
    </div>
  )
}

function Light({ label, light, value, sub }: { label: string; light: TrafficLight; value: string; sub: string }) {
  const dot = light === 'green' ? 'bg-success' : light === 'amber' ? 'bg-warning' : 'bg-danger'
  return (
    <div className="rounded-xl border border-line-light px-3 py-2">
      <p className="m-0 text-xs text-ink-light flex items-center gap-1.5">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden />
        {label}
        <span className="sr-only">{light}</span>
      </p>
      <p className="m-0 font-semibold">{value}</p>
      <p className="m-0 text-xs text-ink-light">{sub}</p>
    </div>
  )
}
