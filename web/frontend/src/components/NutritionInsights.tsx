import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getDiary } from '../api/diary'
import { queryKeys } from '../api/client'
import type { DailyNutrition, DiaryEntry, DiaryResponse, NutritionSettings, WeeklyAnalysis } from '../api/types'
import { MEALS } from '../api/types'
import { formatLongDate, formatNumber, formatShortDate } from '../lib/format'
import { macroShares, summariseNutritionInsights, type MacroShares, type TargetDayCount } from '../lib/nutritionInsights'

const MACRO_COLOURS = {
  protein: '#4caf50',
  carbs: '#2196f3',
  fat: '#ff9800',
} as const

type MacroFocus = keyof typeof MACRO_COLOURS

/** Exploratory additions to Nutrition; all figures derive from existing API responses. */
export function NutritionInsights({ analysis }: { analysis: WeeklyAnalysis }) {
  const summary = summariseNutritionInsights(analysis)
  const numberOfDays = analysis.daily_data.length
  const [expandedDate, setExpandedDate] = useState<string | null>(null)
  const [activeFocus, setActiveFocus] = useState<MacroFocus | null>(null)

  // Fetch the exact saved diary snapshots only when a date is opened. This is
  // both cheaper than loading seven diaries up front and keeps history faithful.
  const diaryQuery = useQuery<DiaryResponse>({
    queryKey: queryKeys.diary(expandedDate ?? 'nutrition-panel-closed'),
    queryFn: () => getDiary(expandedDate ?? analysis.end_date),
    enabled: expandedDate !== null,
    staleTime: 5 * 60_000,
  })

  const proteinScaleMax = getProteinScaleMax(analysis)
  const focusDescription = activeFocus ? describeFocus(activeFocus, analysis.settings, proteinScaleMax) : null

  return (
    <>
      <section className="rounded-2xl bg-card p-4 shadow-card" data-testid="nutrition-macro-pattern">
        <header className="mb-1 flex items-center justify-between gap-2">
          <h2 className="m-0 text-base font-semibold">Macro pattern</h2>
          <PrototypeBadge />
        </header>
        <p className="m-0 text-xs text-ink-muted">
          Each bar is the share of estimated energy from logged protein, carbs and fat. It compares composition, not
          calories eaten.
        </p>
        <p className="m-0 mt-2 text-xs text-ink-light" data-testid="nutrition-pattern-coverage">
          Food calories recorded on {summary.foodDays} of {numberOfDays} days · macro split on {summary.macroDays}
          {summary.macroDays === 1 ? ' day' : ' days'}
        </p>

        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Choose a target overlay">
          <MacroFocusButton
            focus="protein"
            selected={activeFocus === 'protein'}
            target={`≥ ${formatNumber(analysis.settings.protein_goal_per_kg, 1)} g/kg`}
            disabled={!analysis.current_weight_kg}
            onClick={() => setActiveFocus((current) => (current === 'protein' ? null : 'protein'))}
          />
          <MacroFocusButton
            focus="carbs"
            selected={activeFocus === 'carbs'}
            target={`${formatNumber(analysis.settings.carb_min_percent)}–${formatNumber(analysis.settings.carb_max_percent)}%`}
            onClick={() => setActiveFocus((current) => (current === 'carbs' ? null : 'carbs'))}
          />
          <MacroFocusButton
            focus="fat"
            selected={activeFocus === 'fat'}
            target={`≤ ${formatNumber(analysis.settings.fat_max_percent)}%`}
            onClick={() => setActiveFocus((current) => (current === 'fat' ? null : 'fat'))}
          />
        </div>
        <p className="m-0 mt-2 text-[11px] leading-4 text-ink-muted" data-testid="nutrition-focus-note">
          {focusDescription
            ? `${focusDescription}. The shaded band is your saved goal; general reference ranges are not mixed in.`
            : 'Tap a macro to show its daily target rail. Overlays use your saved goals; general reference ranges are not mixed in.'}
        </p>

        <div className="mt-2" role="list" aria-label="Daily macro energy split">
          {analysis.daily_data.map((day) => (
            <MacroDayRow
              key={day.date}
              day={day}
              activeFocus={activeFocus}
              settings={analysis.settings}
              currentWeightAvailable={analysis.current_weight_kg > 0}
              proteinScaleMax={proteinScaleMax}
              expanded={expandedDate === day.date}
              onToggle={() => setExpandedDate((current) => (current === day.date ? null : day.date))}
              diary={expandedDate === day.date ? diaryQuery.data : undefined}
              diaryLoading={expandedDate === day.date && diaryQuery.isPending}
              diaryError={expandedDate === day.date && diaryQuery.isError}
            />
          ))}
        </div>

        <div className="mt-3 border-t border-line-light pt-3">
          <p className="m-0 mb-2 text-xs font-medium text-ink-light">Days meeting your current targets</p>
          <div className="grid grid-cols-2 gap-2">
            <TargetDayCard
              label="Protein"
              count={summary.targetDays.protein}
              target={`≥ ${formatNumber(analysis.settings.protein_goal_per_kg, 1)} g/kg`}
              unavailable={!analysis.current_weight_kg}
            />
            <TargetDayCard
              label="Carbs"
              count={summary.targetDays.carbs}
              target={`${formatNumber(analysis.settings.carb_min_percent)}–${formatNumber(analysis.settings.carb_max_percent)}%`}
            />
            <TargetDayCard
              label="Fat"
              count={summary.targetDays.fat}
              target={`≤ ${formatNumber(analysis.settings.fat_max_percent)}%`}
            />
            <TargetDayCard
              label="Fibre"
              count={summary.targetDays.fibre}
              target={`≥ ${formatNumber(analysis.settings.fibre_goal)} g/day`}
            />
          </div>
        </div>
        <p className="m-0 mt-3 text-[11px] leading-4 text-ink-muted">
          Drink calories are included in the existing calorie totals, but the drink records do not include a macro
          split. A day with food entries may still be incomplete.
        </p>
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-card" data-testid="nutrition-density">
        <header className="mb-1 flex items-center justify-between gap-2">
          <h2 className="m-0 text-base font-semibold">Nutrient density</h2>
          <PrototypeBadge />
        </header>
        <p className="m-0 mb-3 text-xs text-ink-muted">
          Daily amount and food-only density are shown together: one is your daily reference, the other is context for
          the calories recorded.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <DensityCard
            label="Fibre"
            primary={`${formatOptional(summary.averageFibreGramsPerDay, 1)} g/day`}
            primaryNote={fibreReferenceNote(summary.averageFibreGramsPerDay, analysis.settings)}
            density={summary.fibreDensityPer1000FoodKcal}
            testId="nutrition-density-fibre"
          />
          <DensityCard
            label="Protein"
            primary={`${formatOptional(summary.averageProteinPerKg, 2)} g/kg`}
            primaryNote={`personal goal ≥ ${formatNumber(analysis.settings.protein_goal_per_kg, 1)} g/kg`}
            density={summary.proteinDensityPer1000FoodKcal}
            testId="nutrition-density-protein"
          />
        </div>

        <p className="m-0 mt-3 text-[11px] leading-4 text-ink-muted">
          Fibre density is extra context, not a replacement for the 30 g/day reference (or your saved daily goal).
          Density describes the logged data; it cannot tell whether a day is complete or why a value is low.
        </p>
      </section>
    </>
  )
}

function PrototypeBadge() {
  return (
    <span className="shrink-0 rounded-full border border-primary/25 bg-primary/5 px-2 py-1 text-[10px] font-medium text-primary">
      Prototype
    </span>
  )
}

function MacroFocusButton({
  focus,
  selected,
  target,
  disabled = false,
  onClick,
}: {
  focus: MacroFocus
  selected: boolean
  target: string
  disabled?: boolean
  onClick: () => void
}) {
  const label = focus === 'protein' ? 'Protein' : focus === 'carbs' ? 'Carbs' : 'Fat'
  const accessibleAction = selected ? 'Hide' : 'Show'

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${accessibleAction} ${label} target rail, ${target}`}
      data-testid={`nutrition-focus-chip-${focus}`}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${
        selected ? 'border-primary bg-primary/5 text-ink' : 'border-line bg-card text-ink-light'
      }`}
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: MACRO_COLOURS[focus] }} aria-hidden="true" />
      <span className="font-medium">{label}</span>
      <span className="text-[10px] text-ink-muted">{target}</span>
    </button>
  )
}

function MacroDayRow({
  day,
  activeFocus,
  settings,
  currentWeightAvailable,
  proteinScaleMax,
  expanded,
  onToggle,
  diary,
  diaryLoading,
  diaryError,
}: {
  day: DailyNutrition
  activeFocus: MacroFocus | null
  settings: NutritionSettings
  currentWeightAvailable: boolean
  proteinScaleMax: number
  expanded: boolean
  onToggle: () => void
  diary: DiaryResponse | undefined
  diaryLoading: boolean
  diaryError: boolean
}) {
  const shares = day.food_calories > 0 ? macroShares(day) : null
  const dateLabel = formatShortDate(day.date)
  const detailsId = `nutrition-day-details-${day.date}`

  return (
    <div className="py-1" role="listitem">
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_6.5rem] items-center gap-2">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={`${expanded ? 'Hide' : 'Show'} food details for ${dateLabel}`}
          data-testid={`nutrition-day-toggle-${day.date}`}
          onClick={onToggle}
          className="min-h-11 cursor-pointer rounded-lg text-left text-xs tabular-nums text-primary underline decoration-primary/35 underline-offset-2"
        >
          {dateLabel}
        </button>
        {shares ? (
          <>
            <MacroStack day={day} shares={shares} />
            <span className="text-right text-[10px] tabular-nums text-ink-light" aria-hidden="true">
              P {formatNumber(shares.protein)} · C {formatNumber(shares.carbs)} · F {formatNumber(shares.fat)}
            </span>
          </>
        ) : (
          <span className="col-span-2 rounded-full bg-surface px-2 py-1 text-[10px] text-ink-muted">
            No food macro data
          </span>
        )}
      </div>

      {activeFocus && (activeFocus !== 'protein' || currentWeightAvailable) && (
        <FocusRail
          day={day}
          dateLabel={dateLabel}
          focus={activeFocus}
          shares={shares}
          settings={settings}
          proteinScaleMax={proteinScaleMax}
        />
      )}

      {expanded && (
        <DiaryDetails
          date={day.date}
          diary={diary}
          loading={diaryLoading}
          error={diaryError}
          id={detailsId}
        />
      )}
    </div>
  )
}

function MacroStack({ day, shares }: { day: DailyNutrition; shares: MacroShares }) {
  const dateLabel = formatShortDate(day.date)
  return (
    <div
      className="flex h-3 min-w-0 overflow-hidden rounded-full bg-line-light"
      role="img"
      aria-label={`${dateLabel}: protein ${formatNumber(shares.protein, 1)}%, carbs ${formatNumber(shares.carbs, 1)}%, fat ${formatNumber(shares.fat, 1)}%`}
    >
      <span
        className="h-full"
        style={{ width: `${shares.protein}%`, backgroundColor: MACRO_COLOURS.protein }}
        aria-hidden="true"
      />
      <span
        className="h-full"
        style={{ width: `${shares.carbs}%`, backgroundColor: MACRO_COLOURS.carbs }}
        aria-hidden="true"
      />
      <span
        className="h-full"
        style={{ width: `${shares.fat}%`, backgroundColor: MACRO_COLOURS.fat }}
        aria-hidden="true"
      />
    </div>
  )
}

function FocusRail({
  day,
  dateLabel,
  focus,
  shares,
  settings,
  proteinScaleMax,
}: {
  day: DailyNutrition
  dateLabel: string
  focus: MacroFocus
  shares: MacroShares | null
  settings: NutritionSettings
  proteinScaleMax: number
}) {
  const protein = focus === 'protein'
  const recordedValue = shares
    ? protein ? day.protein_per_kg : focus === 'carbs' ? shares.carbs : shares.fat
    : null
  const value = recordedValue !== null && Number.isFinite(recordedValue) ? recordedValue : null
  const scaleMax = protein ? proteinScaleMax : 100
  const bandStart = protein ? settings.protein_goal_per_kg : focus === 'carbs' ? settings.carb_min_percent : 0
  const bandEnd = protein ? scaleMax : focus === 'carbs' ? settings.carb_max_percent : settings.fat_max_percent
  const unit = protein ? ' g/kg' : '%'
  const metricLabel = protein ? 'Protein' : focus === 'carbs' ? 'Carbs' : 'Fat'
  const marker = value === null ? null : clampPercent((value / scaleMax) * 100)
  const bandLeft = clampPercent((bandStart / scaleMax) * 100)
  const bandRight = clampPercent((bandEnd / scaleMax) * 100)
  const bandWidth = Math.max(0, bandRight - bandLeft)
  const bandLabel = protein
    ? `at or above ${formatNumber(settings.protein_goal_per_kg, 1)} g/kg`
    : focus === 'carbs'
      ? `${formatNumber(settings.carb_min_percent)} to ${formatNumber(settings.carb_max_percent)}%`
      : `at or below ${formatNumber(settings.fat_max_percent)}%`

  return (
    <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_6.5rem] items-center gap-2 pb-1" data-testid={`nutrition-focus-rail-${focus}`}>
      <span className="text-[9px] text-ink-muted" aria-hidden="true">Goal</span>
      <div
        className="relative h-2.5 min-w-0 rounded-full bg-line-light"
        role="img"
        aria-label={`${dateLabel}: ${metricLabel} ${value === null ? 'has no food macro data' : `${formatNumber(value, protein ? 2 : 1)}${unit}`}; your target is ${bandLabel}`}
      >
        <span
          className="absolute inset-y-0 rounded-full bg-primary/25"
          style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
          aria-hidden="true"
        />
        {marker !== null && (
          <span
            className="absolute top-1/2 h-3.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-ink shadow-sm"
            style={{ left: `${marker}%` }}
            aria-hidden="true"
          />
        )}
      </div>
      <span className="text-right text-[10px] tabular-nums text-ink-light">
        {value === null ? 'No data' : `${metricLabel} ${formatNumber(value, protein ? 2 : 0)}${unit}`}
      </span>
    </div>
  )
}

function DiaryDetails({
  date,
  diary,
  loading,
  error,
  id,
}: {
  date: string
  diary: DiaryResponse | undefined
  loading: boolean
  error: boolean
  id: string
}) {
  const groupedEntries = MEALS.map((meal) => ({
    id: meal.id,
    label: meal.label,
    entries: diary?.entries.filter((entry) => entry.meal === meal.id) ?? [],
  })).filter((group) => group.entries.length > 0)

  return (
    <section
      id={id}
      className="mt-2 rounded-xl border border-line-light bg-surface p-3"
      data-testid="nutrition-day-details"
      role="region"
      aria-label={`Food details for ${formatShortDate(date)}`}
      aria-live="polite"
    >
      <header className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="m-0 text-sm font-semibold">{formatLongDate(date)} · food details</h3>
          {diary && (
            <p className="m-0 mt-0.5 text-[10px] text-ink-light">
              {diary.entries.length} {diary.entries.length === 1 ? 'item' : 'items'} · {formatNumber(Math.round(diary.totals.calories))} food kcal
            </p>
          )}
        </div>
        <span className="shrink-0 text-[10px] text-ink-muted">Saved per portion</span>
      </header>

      {loading && <p className="m-0 py-2 text-xs text-ink-light" role="status">Loading logged items…</p>}
      {error && <p className="m-0 py-2 text-xs text-danger" role="alert">Couldn’t load this day’s logged items.</p>}
      {diary && diary.entries.length === 0 && !loading && (
        <p className="m-0 py-2 text-xs text-ink-muted">No food or recipe entries were recorded on this day.</p>
      )}
      {diary && groupedEntries.length > 0 && (
        <div className="flex flex-col gap-2">
          {groupedEntries.map((group) => (
            <div key={group.id}>
              <h4 className="m-0 mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{group.label}</h4>
              <div className="flex flex-col gap-1" role="list" aria-label={`${group.label} food entries`}>
                {group.entries.map((entry) => <DiaryFoodRow key={entry.id} entry={entry} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function DiaryFoodRow({ entry }: { entry: DiaryEntry }) {
  const name = entry.recipe_name || entry.food_name || 'Logged item'
  const grams = `${formatNumber(entry.quantity_grams, Number.isInteger(entry.quantity_grams) ? 0 : 1)} g`
  const kind = entry.recipe_id != null ? 'Recipe' : 'Food'

  return (
    <div className="rounded-lg border border-line-light bg-card px-2.5 py-2" role="listitem" data-testid="nutrition-diary-item">
      <div className="flex items-start justify-between gap-2">
        <p className="m-0 min-w-0 break-words text-xs font-medium text-ink">{name}</p>
        <span className="shrink-0 text-[10px] text-ink-light">{kind} · {grams}</span>
      </div>
      <p className="m-0 mt-1 text-[10px] leading-4 tabular-nums text-ink-light">
        {formatNumber(Math.round(entry.calories))} kcal · P {formatNumber(entry.protein, 1)} g · C {formatNumber(entry.carbs, 1)} g · F {formatNumber(entry.fat, 1)} g · Fibre {formatNumber(entry.fibre, 1)} g
      </p>
    </div>
  )
}

function describeFocus(focus: MacroFocus, settings: NutritionSettings, proteinScaleMax: number): string {
  if (focus === 'protein') {
    return `Protein goal ≥ ${formatNumber(settings.protein_goal_per_kg, 1)} g/kg on a 0–${formatNumber(proteinScaleMax, 1)} g/kg scale`
  }
  if (focus === 'carbs') {
    return `Carbs goal ${formatNumber(settings.carb_min_percent)}–${formatNumber(settings.carb_max_percent)}% on a 0–100% scale`
  }
  return `Fat maximum ≤ ${formatNumber(settings.fat_max_percent)}% on a 0–100% scale`
}

function getProteinScaleMax(analysis: WeeklyAnalysis): number {
  const observedMax = analysis.daily_data.reduce(
    (maximum, day) => Math.max(maximum, Number.isFinite(day.protein_per_kg) ? day.protein_per_kg : 0),
    0,
  )
  return Math.max(2, analysis.settings.protein_goal_per_kg * 1.5, observedMax * 1.05)
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function TargetDayCard({
  label,
  count,
  target,
  unavailable = false,
}: {
  label: string
  count: TargetDayCount | null
  target: string
  unavailable?: boolean
}) {
  const value = unavailable || !count || count.days === 0 ? '—' : `${count.met} / ${count.days}`
  const detail = unavailable
    ? 'Add a weigh-in to compare'
    : count?.days
      ? `days at target · ${target}`
      : 'No eligible data in this window'

  return (
    <div className="rounded-xl border border-line-light bg-surface px-2.5 py-2" data-testid={`nutrition-target-days-${label.toLowerCase()}`}>
      <p className="m-0 text-[11px] text-ink-light">{label}</p>
      <p className="m-0 text-sm font-semibold tabular-nums text-ink">{value}</p>
      <p className="m-0 text-[10px] leading-4 text-ink-light">{detail}</p>
    </div>
  )
}

function DensityCard({ label, primary, primaryNote, density, testId }: {
  label: string
  primary: string
  primaryNote: string
  density: number | null
  testId: string
}) {
  const densityText = density === null ? '—' : formatNumber(density, 1)

  return (
    <div className="rounded-xl border border-line-light bg-surface px-3 py-2.5" data-testid={testId}>
      <p className="m-0 text-xs text-ink-light">{label}</p>
      <p className="m-0 mt-0.5 text-lg font-semibold tabular-nums text-ink">{primary}</p>
      <p className="m-0 text-[10px] leading-4 text-ink-light">{primaryNote}</p>
      <div className="mt-2 border-t border-line-light pt-1.5">
        <p className="m-0 text-[10px] leading-4 text-ink-muted">Density context</p>
        <p className="m-0 text-xs font-medium tabular-nums text-ink">{densityText} g / 1,000 food kcal</p>
      </div>
    </div>
  )
}

function fibreReferenceNote(averageFibre: number | null, settings: NutritionSettings): string {
  if (averageFibre === null) return '30 g/day is the reference; no food data in this window'
  const percentage = settings.fibre_goal > 0 ? (averageFibre / settings.fibre_goal) * 100 : 0
  if (settings.fibre_goal === 30) return `${formatNumber(percentage)}% of the 30 g/day reference`
  return `${formatNumber(percentage)}% of your ${formatNumber(settings.fibre_goal)} g goal · 30 g/day reference`
}

function formatOptional(value: number | null, digits: number): string {
  return value === null ? '—' : formatNumber(value, digits)
}
