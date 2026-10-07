import type { DailyNutrition, WeeklyAnalysis } from '../api/types'
import { formatNumber, formatShortDate } from '../lib/format'
import { macroShares, summariseNutritionInsights, type TargetDayCount } from '../lib/nutritionInsights'

const MACRO_COLOURS = {
  protein: '#4caf50',
  carbs: '#2196f3',
  fat: '#ff9800',
} as const

/** Exploratory additions to Nutrition; all figures derive from the existing weekly response. */
export function NutritionInsights({ analysis }: { analysis: WeeklyAnalysis }) {
  const summary = summariseNutritionInsights(analysis)
  const numberOfDays = analysis.daily_data.length

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

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1" aria-label="Macro chart legend">
          <LegendItem label="Protein" colour={MACRO_COLOURS.protein} />
          <LegendItem label="Carbs" colour={MACRO_COLOURS.carbs} />
          <LegendItem label="Fat" colour={MACRO_COLOURS.fat} />
        </div>

        <div className="mt-2" role="list" aria-label="Daily macro energy split">
          {analysis.daily_data.map((day) => (
            <MacroDayRow key={day.date} day={day} />
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
          Food nutrients per 1,000 food kcal for this period. A second lens alongside the daily goals above.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <DensityCard
            label="Fibre"
            density={summary.fibreDensityPer1000FoodKcal}
            average={`${formatOptional(summary.averageFibreGramsPerDay, 1)} g/day`}
            target={`goal ${formatNumber(analysis.settings.fibre_goal)} g/day`}
            testId="nutrition-density-fibre"
          />
          <DensityCard
            label="Protein"
            density={summary.proteinDensityPer1000FoodKcal}
            average={`${formatOptional(summary.averageProteinPerKg, 2)} g/kg`}
            target={`goal ${formatNumber(analysis.settings.protein_goal_per_kg, 1)} g/kg`}
            testId="nutrition-density-protein"
          />
        </div>

        <p className="m-0 mt-3 text-[11px] leading-4 text-ink-muted">
          Density uses summed food nutrients ÷ summed food calories; drink calories are not included in this figure.
          It describes the logged data, but cannot tell whether a day is complete or why a value is low.
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

function LegendItem({ label, colour }: { label: string; colour: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-light">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colour }} aria-hidden="true" />
      {label}
    </span>
  )
}

function MacroDayRow({ day }: { day: DailyNutrition }) {
  const shares = day.food_calories > 0 ? macroShares(day) : null
  const visiblePercent = (value: number) => formatNumber(value)
  const dateLabel = formatShortDate(day.date)

  if (!shares) {
    return (
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_6.5rem] items-center gap-2 py-1" role="listitem">
        <span className="text-xs tabular-nums text-ink-light">{dateLabel}</span>
        <span className="col-span-2 rounded-full bg-surface px-2 py-1 text-[10px] text-ink-muted">
          No food macro data
        </span>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_6.5rem] items-center gap-2 py-1" role="listitem">
      <span className="text-xs tabular-nums text-ink-light">{dateLabel}</span>
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
      <span className="text-right text-[10px] tabular-nums text-ink-light" aria-hidden="true">
        P {visiblePercent(shares.protein)} · C {visiblePercent(shares.carbs)} · F {visiblePercent(shares.fat)}
      </span>
    </div>
  )
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
      : 'No food data in this window'

  return (
    <div className="rounded-xl border border-line-light bg-surface px-2.5 py-2" data-testid={`nutrition-target-days-${label.toLowerCase()}`}>
      <p className="m-0 text-[11px] text-ink-light">{label}</p>
      <p className="m-0 text-sm font-semibold tabular-nums text-ink">{value}</p>
      <p className="m-0 text-[10px] leading-4 text-ink-light">{detail}</p>
    </div>
  )
}

function DensityCard({
  label,
  density,
  average,
  target,
  testId,
}: {
  label: string
  density: number | null
  average: string
  target: string
  testId: string
}) {
  const densityText = density === null ? '—' : formatNumber(density, 1)

  return (
    <div className="rounded-xl border border-line-light bg-surface px-3 py-2.5" data-testid={testId}>
      <p className="m-0 text-xs text-ink-light">{label}</p>
      <p className="m-0 mt-0.5 whitespace-nowrap text-lg font-semibold tabular-nums text-ink">
        {densityText} <span className="text-[10px] font-medium text-ink-light">g / 1,000 kcal</span>
      </p>
      <p className="m-0 mt-1 text-[10px] leading-4 text-ink-light">{average}</p>
      <p className="m-0 text-[10px] leading-4 text-ink-light">{target}</p>
    </div>
  )
}

function formatOptional(value: number | null, digits: number): string {
  return value === null ? '—' : formatNumber(value, digits)
}
