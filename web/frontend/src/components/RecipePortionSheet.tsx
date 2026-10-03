import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createDiaryEntry } from '../api/diary'
import { queryKeys } from '../api/client'
import { MEALS, type Meal, type RecipeDetail } from '../api/types'
import { formatGrams, formatNumber, relativeDayLabel, todayIso } from '../lib/format'
import { mealLabel } from '../lib/recipePick'
import {
  WHOLE_RECIPE_FRACTIONS,
  canLogRecipePortion,
  fractionGrams,
  matchingFraction,
  recipeNutritionForGrams,
  suggestedMeal,
} from '../lib/recipePortion'
import { Modal } from './Modal'

/**
 * Log a portion of a recipe to the diary (owner decisions 31 and 32).
 *
 * - Fractions are of the whole cooked recipe; `serves` is never used to guess
 *   what one person eats.
 * - With no remembered usual, nothing is preselected — the user chooses a
 *   fraction or types grams.
 * - The first successful log becomes their usual. Later amounts are one-off
 *   unless "Make this my usual" is ticked.
 * - Direct gram editing is always available, and every path stores grams plus
 *   the entry's own nutrition snapshot.
 */
export function RecipePortionSheet({
  recipe,
  onClose,
  onDone,
  initialMeal,
  initialDate,
}: {
  recipe: RecipeDetail
  onClose: () => void
  /**
   * Called when the confirmation is dismissed instead of `onClose`. The
   * recipe-box flow set it to take the user back to the diary day and meal the
   * pick started from, so a trip out of the Diary ends where they left it.
   */
  onDone?: () => void
  /**
   * When opened from the Diary, the meal the action was started from is
   * preselected so the user does not have to pick it twice (decision 40).
   * When opened from recipe detail, the sheet still guesses by time of day.
   */
  initialMeal?: Meal
  /** Defaults to today; the Diary passes the date being viewed. */
  initialDate?: string
}) {
  const queryClient = useQueryClient()
  const today = todayIso()
  const [date, setDate] = useState(initialDate ?? today)
  const [meal, setMeal] = useState<Meal>(
    initialMeal ?? suggestedMeal(new Date().getHours()),
  )
  const [gramsText, setGramsText] = useState(
    recipe.usual_grams === null ? '' : String(recipe.usual_grams),
  )
  const [makeUsual, setMakeUsual] = useState(false)
  const [confirmation, setConfirmation] = useState<string | null>(null)

  const grams = Number.parseFloat(gramsText)
  const valid = Number.isFinite(grams) && grams > 0
  const nutrition = valid ? recipeNutritionForGrams(recipe, grams) : null
  const canLog = canLogRecipePortion(recipe)
  const usual = recipe.usual_grams
  const differsFromUsual = valid && (usual === null || Math.abs(grams - usual) >= 0.5)
  const activeFraction = matchingFraction(recipe.total_weight_grams, valid ? grams : Number.NaN)
  /** True when a diary meal opened the sheet, so meal and date were chosen for the user. */
  const fromDiary = initialMeal !== undefined || initialDate !== undefined
  // "today"/"yesterday" read naturally mid-sentence; a real date does not want
  // its month lower-cased. Shared by the caption and the confirmation line.
  const relativeLabel = relativeDayLabel(date, today)
  const dayCaption = ['Today', 'Yesterday', 'Tomorrow'].includes(relativeLabel)
    ? relativeLabel.toLowerCase()
    : relativeLabel

  const log = useMutation({
    mutationFn: () =>
      createDiaryEntry(date, {
        meal,
        recipe_id: recipe.id,
        ...(nutrition as NonNullable<typeof nutrition>),
        ...(makeUsual ? { make_usual: true } : {}),
      }),
    onSuccess: () => {
      const remembered = usual === null || makeUsual
      setConfirmation(
        `Logged ${formatGrams(grams)} to ${dayCaption}` +
          `${remembered ? ' — saved as your usual portion.' : '.'}`,
      )
      void queryClient.invalidateQueries({ queryKey: queryKeys.diary(date) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.bank(date) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.recipe(recipe.id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.recipes })
    },
  })

  if (confirmation) {
    return (
      <Modal open title="Added to your diary" onClose={onClose}>
        <p role="status" className="m-0 text-sm text-ink">
          {confirmation}
        </p>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onDone ?? onClose}
            className="min-h-11 rounded-xl bg-primary px-4 text-sm font-medium text-white"
          >
            Done
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      title={fromDiary ? `Add ${recipe.name} to ${mealLabel(meal)}` : `Add ${recipe.name}`}
      onClose={onClose}
    >
      {!canLog ? (
        <p role="alert" className="m-0 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          This recipe has no cooked weight yet, so a portion cannot be calculated. Add ingredients and a
          cooked weight first.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="m-0 text-xs text-ink-light">
            {formatNumber(recipe.calories_per_100g)} kcal per 100 g cooked · {formatNumber(recipe.total_calories)} kcal
            total
          </p>

          {fromDiary && (
            <p className="m-0 rounded-xl bg-primary-light/15 px-3 py-2 text-xs leading-relaxed text-primary-dark">
              <span className="font-semibold">{`Going to ${mealLabel(meal)} · ${dayCaption}`}</span>
              <span>{' — carried over from your diary. Change either below if you meant somewhere else.'}</span>
            </p>
          )}

          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-1 text-sm font-semibold">How much of the whole recipe?</legend>
            <div className="flex flex-wrap gap-2">
              {WHOLE_RECIPE_FRACTIONS.map((option) => {
                const amount = fractionGrams(recipe.total_weight_grams, option.fraction)
                return (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={activeFraction?.fraction === option.fraction}
                    onClick={() => {
                      if (amount !== null) {
                        setGramsText(String(amount))
                        log.reset()
                      }
                    }}
                    className={`min-h-11 rounded-xl border px-3 text-sm ${
                      activeFraction?.fraction === option.fraction
                        ? 'border-primary bg-primary/10 font-semibold text-primary-dark'
                        : 'border-line bg-card text-ink'
                    }`}
                  >
                    {option.label}
                    <span className="block text-xs font-normal text-ink-light">
                      {amount === null ? '—' : formatGrams(amount)}
                    </span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          <div className="flex items-center gap-2">
            <label className="text-sm text-ink-light" htmlFor="portion-grams">
              Weight (grams)
            </label>
            <input
              id="portion-grams"
              type="number"
              inputMode="decimal"
              min={1}
              step={5}
              value={gramsText}
              onChange={(event) => {
                setGramsText(event.target.value)
                log.reset()
              }}
              className="w-28 min-h-11 rounded-xl border border-line px-3 text-base tabular-nums"
            />
            <span className="text-sm text-ink-light">g</span>
          </div>

          <p aria-live="polite" className="m-0 text-sm tabular-nums">
            {valid && nutrition
              ? `${formatGrams(grams)} = ${formatNumber(nutrition.calories)} kcal`
              : usual === null
                ? 'Choose a fraction or enter grams — nothing is guessed for you.'
                : `Your usual portion is ${formatGrams(usual)}.`}
          </p>

          {usual !== null && differsFromUsual && (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={makeUsual}
                onChange={(event) => setMakeUsual(event.target.checked)}
                className="h-5 w-5 accent-primary"
              />
              Make this my usual portion
            </label>
          )}

          {usual === null && valid && (
            <p className="m-0 text-xs text-ink-light">
              We&rsquo;ll remember this as your usual portion. Later changes stay one-off unless you tick
              &ldquo;Make this my usual&rdquo;.
            </p>
          )}

          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-1 text-sm font-semibold">Meal</legend>
            <div className="flex flex-wrap gap-2">
              {MEALS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={meal === option.id}
                  onClick={() => setMeal(option.id)}
                  className={`min-h-11 rounded-xl border px-3 text-sm ${
                    meal === option.id
                      ? 'border-primary bg-primary/10 font-semibold text-primary-dark'
                      : 'border-line bg-card text-ink'
                  }`}
                >
                  <span aria-hidden className="mr-1">
                    {option.icon}
                  </span>
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="flex max-w-xs flex-col gap-1 text-sm font-medium">
            Day
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value || today)}
              className="min-h-11 rounded-xl border border-line bg-card px-3"
            />
          </label>

          {log.isError && (
            <p role="alert" className="m-0 text-sm text-danger">
              {(log.error as Error).message}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-xl border border-line bg-surface px-4 text-sm text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!valid || !nutrition || log.isPending}
              onClick={() => log.mutate()}
              className="min-h-11 rounded-xl bg-primary px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              {log.isPending ? 'Adding…' : 'Add to diary'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
