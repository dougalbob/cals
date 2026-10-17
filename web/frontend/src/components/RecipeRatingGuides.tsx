import { formatNumber } from '../lib/format'
import {
  ratingList,
  recipeRatings,
  type NutrientRating,
  type RecipeRatingInput,
  type RecipeRatings,
} from '../lib/recipeRatings'

/**
 * Nutrition rating guides (issue #97, decision 126).
 *
 * One visual language everywhere: a label above a star, with the
 * score inside the star. The number is always present, so colour
 * is a reinforcement rather than the only signal (decision 28's
 * rule). Stars are filled by band: green for 4–5, amber for 3,
 * orange-red for 1–2.
 */

const STAR_PATH =
  'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z'

/** Star fill by score; the numeral inside carries the value too. */
const STAR_COLOURS: Record<number, string> = {
  5: 'text-emerald-600',
  4: 'text-green-500',
  3: 'text-amber-500',
  2: 'text-orange-500',
  1: 'text-rose-500',
}

/** A label above a star, with the score inside the star. */
function GuideStar({
  label,
  score,
  testId,
  ariaLabel,
  starSize = 30,
}: {
  label: string
  score: number
  testId: string
  ariaLabel: string
  starSize?: number
}) {
  // A decimal (the overall mean) needs a smaller numeral to fit.
  const fontSize = Number.isInteger(score) ? 11 : 8.5
  return (
    <span role="img" aria-label={ariaLabel} data-testid={testId} className="inline-flex flex-col items-center gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-ink-light">
        {label}
      </span>
      <svg
        viewBox="0 0 24 24"
        width={starSize}
        height={starSize}
        aria-hidden="true"
        className={STAR_COLOURS[score] ?? 'text-ink-light'}
      >
        <path fill="currentColor" d={STAR_PATH} />
        <text
          x="12"
          y="15.75"
          textAnchor="middle"
          fontSize={fontSize}
          fontWeight="700"
          fill="white"
        >
          {score}
        </text>
      </svg>
    </span>
  )
}

function ratingAriaLabel(rating: NutrientRating): string {
  return `${rating.label}: ${formatNumber(rating.value, 1)} ${rating.unit}, rated ${rating.score} out of 5 — ${rating.band.toLowerCase()}`
}

function overallAriaLabel(ratings: RecipeRatings): string {
  return `Overall: ${ratings.overall} out of 5 — the average of the fat, fibre, carbs and volume guides`
}

/**
 * The compact hint for a catalogue card: the overall guide plus
 * the four individual guides, each a label above a small star.
 * Renders nothing when the recipe cannot be rated.
 */
export function RecipeRatingHint({ recipe }: { recipe: RecipeRatingInput }) {
  const ratings = recipeRatings(recipe)
  if (!ratings) return null

  return (
    <div
      data-testid="recipe-rating-hint"
      aria-label="Nutrition rating guides"
      className="mt-2 flex items-start gap-3"
    >
      <GuideStar
        label="Overall"
        score={ratings.overall}
        testId="rating-star-overall"
        ariaLabel={overallAriaLabel(ratings)}
      />
      {ratingList(ratings).map((rating) => (
        <GuideStar
          key={rating.key}
          label={rating.label === 'Volume' ? 'g/kcal' : rating.label}
          score={rating.score}
          testId={`rating-star-${rating.key}`}
          ariaLabel={ratingAriaLabel(rating)}
        />
      ))}
    </div>
  )
}

/** One full-guide row on the detail page: star, measured value and band. */
function GuideRow({ rating }: { rating: NutrientRating }) {
  return (
    <li className="flex items-center gap-4 py-2">
      <GuideStar
        label={rating.label}
        score={rating.score}
        testId={`rating-guide-${rating.key}`}
        ariaLabel={ratingAriaLabel(rating)}
        starSize={44}
      />
      <div className="min-w-0">
        <p className="m-0 text-sm font-semibold tabular-nums">
          {formatNumber(rating.value, 1)} <span className="font-normal text-ink-light">{rating.unit}</span>
        </p>
        <p className="m-0 text-xs text-ink-light">{rating.band}</p>
      </div>
    </li>
  )
}

/**
 * The full guide on recipe detail: the overall mean first, then
 * each nutrient with its measured value and band. A recipe that
 * cannot be rated says so instead of showing zeros.
 */
export function RecipeRatingGuide({ recipe }: { recipe: RecipeRatingInput }) {
  const ratings = recipeRatings(recipe)

  if (!ratings) {
    return (
      <section aria-labelledby="recipe-ratings-title" className="border-t border-line-light pt-4">
        <h3 id="recipe-ratings-title" className="m-0 text-base font-semibold">
          Rating guides
        </h3>
        <p className="mb-0 mt-2 text-sm text-ink-light">
          Rating guides need a cooked weight and calorie information for this recipe.
        </p>
      </section>
    )
  }

  return (
    <section
      data-testid="recipe-rating-guide"
      aria-labelledby="recipe-ratings-title"
      className="border-t border-line-light pt-4"
    >
      <h3 id="recipe-ratings-title" className="m-0 text-base font-semibold">
        Rating guides
      </h3>
      <p className="mb-0 mt-1 text-xs leading-relaxed text-ink-light">
        Four quick guides, each scored 1–5 (5 is excellent) from per-100 g densities: fat,
        fibre and carbs, plus grams per kcal for volume. The overall guide is their average.
        Advisory only — a guide to what the recipe contains, never a verdict on it.
      </p>
      <ul className="m-0 mt-2 list-none p-0">
        <li className="flex items-center gap-4 border-b border-line-light py-2">
          <GuideStar
            label="Overall"
            score={ratings.overall}
            testId="rating-guide-overall"
            ariaLabel={overallAriaLabel(ratings)}
            starSize={44}
          />
          <p className="m-0 text-sm text-ink-light">
            Average of the four guides
          </p>
        </li>
        {ratingList(ratings).map((rating) => (
          <GuideRow key={rating.key} rating={rating} />
        ))}
      </ul>
    </section>
  )
}
