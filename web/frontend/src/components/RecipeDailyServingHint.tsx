import { useQuery } from '@tanstack/react-query'
import { apiGet, queryKeys } from '../api/client'
import { getDiary, getDrinkEntries } from '../api/diary'
import type { RecipeDetail, User } from '../api/types'
import { maxRecipeGramsWithinDailyCalories } from '../lib/recipePortion'
import { formatGrams, formatNumber, relativeDayLabel, todayIso } from '../lib/format'

/**
 * A recipe-specific portion estimate for the selected diary day. The catalogue
 * deliberately does not mount this component: the calculation happens only
 * after a recipe is opened (or its portion sheet is opened from the picker).
 */
export function RecipeDailyServingHint({ recipe, date }: { recipe: RecipeDetail; date: string }) {
  const user = useQuery<User>({
    queryKey: queryKeys.user,
    queryFn: () => apiGet<User>('/api/users/me'),
    staleTime: 0,
  })
  const diary = useQuery({
    queryKey: queryKeys.diary(date),
    queryFn: () => getDiary(date),
    staleTime: 0,
  })
  const drinks = useQuery({
    queryKey: queryKeys.drinks(date),
    queryFn: () => getDrinkEntries(date),
    staleTime: 0,
  })
  const isPending = user.isPending || diary.isPending || drinks.isPending
  const isError = user.isError || diary.isError || drinks.isError
  const drinkCalories = (drinks.data ?? []).reduce((total, entry) => total + entry.calories, 0)

  const today = todayIso()
  const dayLabel = relativeDayLabel(date, today)
  const dayPhrase = ['Today', 'Yesterday', 'Tomorrow'].includes(dayLabel)
    ? dayLabel.toLowerCase()
    : `on ${dayLabel}`
  const wrapperClass = 'rounded-xl border px-3 py-2.5'
  const baseClass = 'm-0 text-sm leading-relaxed'

  if (isPending) {
    return (
      <aside
        aria-label="Daily calorie serving suggestion"
        aria-live="polite"
        className={`${wrapperClass} border-primary/20 bg-primary-light/15`}
      >
        <p className={`${baseClass} text-ink-light`}>
          Checking calories for {dayPhrase}…
        </p>
      </aside>
    )
  }

  if (isError || !user.data || !diary.data || !drinks.data) {
    return (
      <aside
        aria-label="Daily calorie serving suggestion"
        aria-live="polite"
        className={`${wrapperClass} border-line bg-surface`}
      >
        <p className={`${baseClass} text-ink-light`}>
          The daily serving guide is unavailable right now; you can still choose a portion.
        </p>
      </aside>
    )
  }

  const dailyGoal = user.data.daily_calorie_goal
  const remainingCalories = dailyGoal - diary.data.totals.calories - drinkCalories
  const grams = maxRecipeGramsWithinDailyCalories(recipe, remainingCalories)
  const tone = remainingCalories <= 0
    ? 'border-danger/25 bg-danger/5'
    : 'border-primary/20 bg-primary-light/15'

  return (
    <aside
      aria-label="Daily calorie serving suggestion"
      aria-live="polite"
      data-testid="recipe-daily-serving-hint"
      className={`${wrapperClass} ${tone}`}
    >
      {dailyGoal <= 0 ? (
        <p className={`${baseClass} text-ink-light`}>
          Set a daily calorie goal in Settings to see a serving-size guide.
        </p>
      ) : remainingCalories < 0 ? (
        <p className={`${baseClass} text-danger`}>
          You&rsquo;re already {formatNumber(Math.abs(remainingCalories))} kcal over your daily calorie goal {dayPhrase}.
          {' '}Any portion would take you further over.
        </p>
      ) : remainingCalories === 0 ? (
        <p className={`${baseClass} text-danger`}>
          You&rsquo;ve reached your daily calorie goal {dayPhrase}; any portion would take you over.
        </p>
      ) : grams === null ? (
        <p className={`${baseClass} text-ink-light`}>
          This recipe&rsquo;s nutrition is not available to calculate a serving-size guide.
        </p>
      ) : grams === 0 ? (
        <p className={`${baseClass} text-primary-dark`}>
          Less than 1 g would fit within your remaining {formatNumber(remainingCalories)} kcal {dayPhrase}.
        </p>
      ) : (
        <>
          <p className={`${baseClass} text-primary-dark`}>
            <span className="font-semibold">Suggested serving size:</span>{' '}
            up to {formatGrams(grams)} to stay within your daily calorie goal {dayPhrase}.
          </p>
          <p className="m-0 mt-1 text-xs leading-relaxed text-ink-light">
            Based on {formatNumber(remainingCalories)} kcal left, including food and drinks logged {dayPhrase}.
          </p>
        </>
      )}
    </aside>
  )
}
