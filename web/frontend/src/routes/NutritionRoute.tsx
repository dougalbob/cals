import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPut, queryKeys } from '../api/client'
import type { NutritionSettings, WeeklyAnalysis } from '../api/types'
import { BarChart, LineChart } from '../components/charts'
import { DonutChart } from '../components/DonutChart'
import { Modal } from '../components/Modal'
import { NutritionInsights } from '../components/NutritionInsights'
import { StatusLight } from '../components/StatusLight'
import { formatNumber, formatShortDate } from '../lib/format'

/**
 * Nutrition route (Phase 14 slice 14.5).
 *
 * Parity with V1's Nutrition tab (web/static/js/components/nutrition.js):
 *  - four traffic-light status cards (protein, carbs, fat, fibre)
 *  - a macro-split donut
 *  - a protein g/kg bar chart with a goal line
 *  - a fibre grams line chart with a goal line
 *  - a per-day table
 *  - a Goals modal for the four thresholds (edits existing
 *    /api/nutrition/settings, which V1 already had)
 *
 * Calories come back food+drink (drink calories count — decisions 1, 14.1
 * precedent) so the kcal/day figure here agrees with the ring on Today/Diary;
 * macros are food-only because the drink schema has no macro columns. The
 * tracked-nutrients checklist and the missing-data audit (decision 47) are
 * deferred to Phase 15 where the Settings screen lives; the four V1 macros
 * are rendered in a map so extra nutrients slot in when they arrive.
 */

const MACRO_COLOURS = {
  protein: '#4caf50',
  carbs: '#2196f3',
  fat: '#ff9800',
  fibre: '#9c27b0',
} as const

const DEFAULT_SETTINGS: NutritionSettings = {
  protein_goal_per_kg: 0.8,
  fibre_goal: 30,
  fat_max_percent: 35,
  carb_min_percent: 45,
  carb_max_percent: 65,
}

export function NutritionRoute() {
  // V1 parity: a fixed 7-day rolling window anchored at today. The 14.6 weekly
  // report adds the date-range picker (Q11).
  const DAYS = 7

  const analysis = useQuery<WeeklyAnalysis>({
    queryKey: queryKeys.nutrition(DAYS),
    queryFn: () => apiGet<WeeklyAnalysis>(`/api/nutrition/weekly?days=${DAYS}`),
  })

  const [settingsOpen, setSettingsOpen] = useState(false)

  const queryClient = useQueryClient()
  const saveSettings = useMutation({
    mutationFn: (next: NutritionSettings) => apiPut<NutritionSettings>('/api/nutrition/settings', next),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['nutrition'] })
      setSettingsOpen(false)
    },
  })

  const data = analysis.data
  const settings = data?.settings ?? DEFAULT_SETTINGS
  const averages = data?.averages
  const daily = data?.daily_data ?? []

  const donutSlices = useMemo(() => {
    if (!averages || averages.protein_percent + averages.carbs_percent + averages.fat_percent === 0) return []
    return [
      { label: 'Protein', value: averages.protein_percent, color: MACRO_COLOURS.protein },
      { label: 'Carbs', value: averages.carbs_percent, color: MACRO_COLOURS.carbs },
      { label: 'Fat', value: averages.fat_percent, color: MACRO_COLOURS.fat },
    ]
  }, [averages])

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl bg-card p-4 shadow-card">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="m-0 text-base font-semibold">🥗 Nutrition — 7 day rolling</h2>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="min-h-9 cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-medium text-ink hover:bg-surface"
          >
            ⚙ Goals
          </button>
        </div>
        {analysis.isPending ? (
          <p className="text-sm text-ink-light">Loading…</p>
        ) : data && averages ? (
          <>
        <p className="m-0 mb-3 text-xs text-ink-light">
          {data.days_with_data} day{data.days_with_data === 1 ? '' : 's'} with data · avg{' '}
          {formatNumber(averages.calories)} kcal/day
        </p>
            <div className="grid grid-cols-2 gap-3">
              <StatusLight
                label="Protein"
                light={data.status.protein}
                value={`${averages.protein.toFixed(0)} g`}
                sub={`${averages.protein_per_kg.toFixed(2)} g/kg · goal ${settings.protein_goal_per_kg}`}
              />
              <StatusLight
                label="Carbs"
                light={data.status.carbs}
                value={`${averages.carbs_percent.toFixed(0)}%`}
                sub={`target ${settings.carb_min_percent}–${settings.carb_max_percent}%`}
              />
              <StatusLight
                label="Fat"
                light={data.status.fat}
                value={`${averages.fat_percent.toFixed(0)}%`}
                sub={`max ${settings.fat_max_percent}%`}
              />
              <StatusLight
                label="Fibre"
                light={data.status.fibre}
                value={`${averages.fibre.toFixed(0)} g`}
                sub={`goal ${settings.fibre_goal} g`}
              />
            </div>
          </>
        ) : null}
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-card">
        <h2 className="m-0 mb-1 text-base font-semibold">Macro split (7 day avg)</h2>
        <p className="m-0 mb-3 text-xs text-ink-muted">
          Share of calories from protein, carbs and fat across days with data.
        </p>
        {analysis.isPending ? (
          <p className="text-sm text-ink-light">Loading…</p>
        ) : averages ? (
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-6">
            <DonutChart
              slices={donutSlices}
              centerLabel={`${formatNumber(averages.calories)}`}
              centerSub="kcal / day"
              ariaLabel="Protein, carbs and fat as a share of calories"
            />
            <div className="flex flex-col gap-2 text-sm">
              <LegendRow color={MACRO_COLOURS.protein} label="Protein" value={`${averages.protein_percent.toFixed(1)}%`} hint="10–35%" />
              <LegendRow color={MACRO_COLOURS.carbs} label="Carbs" value={`${averages.carbs_percent.toFixed(1)}%`} hint={`${settings.carb_min_percent}–${settings.carb_max_percent}%`} />
              <LegendRow color={MACRO_COLOURS.fat} label="Fat" value={`${averages.fat_percent.toFixed(1)}%`} hint={`<${settings.fat_max_percent}%`} />
              <p className="m-0 mt-1 text-xs text-ink-muted">
                Food and drink calories combined; macros are food-only (drinks carry no macro breakdown).
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-card">
        <h2 className="m-0 mb-1 text-base font-semibold">Protein</h2>
        <p className="m-0 mb-3 text-xs text-ink-muted">
          Daily grams per kg body weight · goal {settings.protein_goal_per_kg} g/kg · green at goal, amber below, red below 70%.
        </p>
        {analysis.isPending ? (
          <p className="text-sm text-ink-light">Loading…</p>
        ) : daily.length ? (
          <BarChart
            points={daily.map((d) => ({ label: formatShortDate(d.date), value: d.protein_per_kg || 0 }))}
            goal={settings.protein_goal_per_kg}
            accent={MACRO_COLOURS.protein}
            bands={false}
            height={150}
          />
        ) : (
          <p className="text-sm text-ink-muted">No data yet.</p>
        )}
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-card">
        <h2 className="m-0 mb-1 text-base font-semibold">Fibre</h2>
        <p className="m-0 mb-3 text-xs text-ink-muted">
          Daily grams · goal {settings.fibre_goal} g · UK recommendation 30 g/day.
        </p>
        {analysis.isPending ? (
          <p className="text-sm text-ink-light">Loading…</p>
        ) : daily.length ? (
          <LineChart
            points={daily.map((d) => ({ label: formatShortDate(d.date), value: d.fibre }))}
            stroke={MACRO_COLOURS.fibre}
            valueLabel={(v) => `${v.toFixed(0)} g`}
            height={150}
          />
        ) : (
          <p className="text-sm text-ink-muted">No data yet.</p>
        )}
      </section>

      {data && <NutritionInsights analysis={data} />}

      <section className="rounded-2xl bg-card p-4 shadow-card">
        <h2 className="m-0 mb-3 text-base font-semibold">Daily table</h2>
        {analysis.isPending ? (
          <p className="text-sm text-ink-light">Loading…</p>
        ) : daily.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="nutrition-daily-table">
              <thead>
                <tr className="text-left text-xs text-ink-light">
                  <th className="pr-2 pb-2 font-medium">Day</th>
                  <th className="px-2 pb-2 font-medium text-right">kcal</th>
                  <th className="px-2 pb-2 font-medium text-right">Protein</th>
                  <th className="px-2 pb-2 font-medium text-right">Carbs</th>
                  <th className="px-2 pb-2 font-medium text-right">Fat</th>
                  <th className="pl-2 pb-2 font-medium text-right">Fibre</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((d) => {
                  const hasData = d.calories > 0
                  return (
                    <tr key={d.date} className={hasData ? '' : 'text-ink-light'}>
                      <td className="pr-2 py-1">{formatShortDate(d.date)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{hasData ? Math.round(d.calories) : '—'}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{d.protein > 0 ? `${d.protein.toFixed(0)} g` : '—'}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{d.carbs > 0 ? `${d.carbs.toFixed(0)} g` : '—'}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{d.fat > 0 ? `${d.fat.toFixed(0)} g` : '—'}</td>
                      <td className="pl-2 py-1 text-right tabular-nums">{d.fibre > 0 ? `${d.fibre.toFixed(0)} g` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">No data yet.</p>
        )}
        <p className="m-0 mt-3 text-xs text-ink-muted">
          Insights are based on logged food and drink data and are intended for general guidance.
        </p>
      </section>

      {settingsOpen && data && (
        <NutritionSettingsModal
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={(next) => saveSettings.mutate(next)}
          saving={saveSettings.isPending}
          error={saveSettings.error instanceof Error ? saveSettings.error.message : null}
        />
      )}
    </div>
  )
}

function NutritionSettingsModal({
  settings,
  onClose,
  onSave,
  saving,
  error,
}: {
  settings: NutritionSettings
  onClose: () => void
  onSave: (s: NutritionSettings) => void
  saving: boolean
  error: string | null
}) {
  const [protein, setProtein] = useState(String(settings.protein_goal_per_kg))
  const [fibre, setFibre] = useState(String(settings.fibre_goal))
  const [fat, setFat] = useState(String(settings.fat_max_percent))
  const [carbMin, setCarbMin] = useState(String(settings.carb_min_percent))
  const [carbMax, setCarbMax] = useState(String(settings.carb_max_percent))

  const submit = () => {
    const parsed: NutritionSettings = {
      protein_goal_per_kg: Number(protein),
      fibre_goal: Number(fibre),
      fat_max_percent: Number(fat),
      carb_min_percent: Number(carbMin),
      carb_max_percent: Number(carbMax),
    }
    onSave(parsed)
  }

  return (
    <Modal open title="Nutrition goals" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <NumberField
          label="Protein goal (g per kg body weight)"
          value={protein}
          onChange={setProtein}
          step="0.1"
          min="0.5"
          max="3.0"
          hint="Sedentary: 0.8 · Active: 1.2–2.0"
        />
        <NumberField
          label="Daily fibre goal (g)"
          value={fibre}
          onChange={setFibre}
          step="1"
          min="10"
          max="60"
          hint="UK recommendation: 30 g"
        />
        <NumberField
          label="Maximum fat (% of calories)"
          value={fat}
          onChange={setFat}
          step="1"
          min="15"
          max="50"
          hint="Recommended: 20–35%"
        />
        <div>
          <p className="m-0 mb-1 text-sm font-medium text-ink">Carbohydrate range (% of calories)</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              value={carbMin}
              onChange={(e) => setCarbMin(e.target.value)}
              min={20}
              max={60}
              className="w-20 rounded-lg border border-line px-2 py-2 text-sm"
            />
            <span className="text-sm text-ink-light">to</span>
            <input
              type="number"
              inputMode="decimal"
              value={carbMax}
              onChange={(e) => setCarbMax(e.target.value)}
              min={30}
              max={80}
              className="w-20 rounded-lg border border-line px-2 py-2 text-sm"
            />
            <span className="text-xs text-ink-muted">Recommended: 45–65%</span>
          </div>
        </div>
        {error && <p className="m-0 text-sm text-danger">{error}</p>}
        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 cursor-pointer rounded-xl border border-line px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="min-h-11 cursor-pointer rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save goals'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function NumberField({
  label,
  value,
  onChange,
  step,
  min,
  max,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  step: string
  min: string
  max: string
  hint?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-ink">{label}</label>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        step={step}
        min={min}
        max={max}
        className="w-28 rounded-lg border border-line px-2 py-2 text-sm"
      />
      {hint && <p className="m-0 mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  )
}

function LegendRow({ color, label, value, hint }: { color: string; label: string; value: string; hint: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span aria-hidden className="inline-block h-3 w-3 rounded-full" style={{ background: color }} />
      <span className="font-medium">{label}:</span>
      <span className="tabular-nums">{value}</span>
      <span className="ml-auto text-xs text-ink-muted">{hint}</span>
    </div>
  )
}
