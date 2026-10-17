import { useId, useState } from 'react'
import type { RecipeDetail } from '../api/types'
import { formatGrams, formatNumber } from '../lib/format'
import { recipeGramsForCalories } from '../lib/recipePortion'

/** A local, advisory calculator: never writes a recipe, portion or diary row. */
export function RecipeCalorieTarget({ recipe, savedRecipeNotice = false }: {
  recipe: Pick<RecipeDetail, 'total_weight_grams' | 'calories_per_100g'>
  savedRecipeNotice?: boolean
}) {
  const id = useId()
  const [target, setTarget] = useState('')
  const calories = Number(target)
  const hasTarget = target.trim() !== ''
  const validTarget = Number.isFinite(calories) && calories > 0
  const grams = recipeGramsForCalories(recipe, calories)
  const available = recipeGramsForCalories(recipe, 1) !== null

  return (
    <aside aria-label="Calorie target calculator" className="rounded-xl border border-primary/20 bg-primary-light/15 p-3">
      <label htmlFor={id} className="block text-sm font-semibold">Calories to spend</label>
      <div className="mt-2 flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          placeholder="e.g. 375"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          aria-describedby={`${id}-result ${id}-note`}
          aria-invalid={hasTarget && !validTarget}
          className="min-h-11 w-28 rounded-xl border border-line bg-card px-3 text-base tabular-nums"
        />
        <span className="text-sm text-ink-light">kcal</span>
      </div>
      <p id={`${id}-result`} aria-live="polite" className="mb-0 mt-2 text-sm leading-relaxed text-primary-dark">
        {!available
          ? 'This recipe needs a cooked weight and positive calorie information to calculate a serving.'
          : !hasTarget
            ? 'Enter a calorie target to see the equivalent cooked weight.'
            : !validTarget
              ? 'Enter a calorie target greater than zero.'
              : grams === null
                ? 'This target is too large to calculate. Try a smaller number.'
                : <><span className="font-semibold">{formatNumber(calories, Number.isInteger(calories) ? 0 : 1)} kcal ≈ {grams < 0.1 ? 'less than 0.1 g' : formatGrams(grams)}</span> cooked.
                  {grams > recipe.total_weight_grams && <> That is more than the whole recipe ({formatGrams(recipe.total_weight_grams)}).</>}
                </>}
      </p>
      <p id={`${id}-note`} className="mb-0 mt-1 text-xs leading-relaxed text-ink-light">
        {savedRecipeNotice
          ? 'Based on the saved recipe. Save ingredient or cooked-weight changes to update this guide.'
          : 'Guide only — your selected portion stays unchanged.'}
      </p>
    </aside>
  )
}
