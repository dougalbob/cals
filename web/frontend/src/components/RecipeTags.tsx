import {
  RECIPE_DISH_TYPES,
  RECIPE_MEAL_OCCASIONS,
  type Recipe,
} from '../api/types'

export function RecipeTags({
  recipe,
  className = '',
}: {
  recipe: Pick<Recipe, 'meal_occasions' | 'dish_type' | 'key_foods' | 'name'>
  className?: string
}) {
  const labels = [
    ...recipe.meal_occasions.map(
      (occasion) => RECIPE_MEAL_OCCASIONS.find((item) => item.value === occasion)?.label ?? occasion,
    ),
    ...(recipe.dish_type
      ? [RECIPE_DISH_TYPES.find((item) => item.value === recipe.dish_type)?.label ?? recipe.dish_type]
      : []),
    ...recipe.key_foods.map((food) => food.food_name),
  ]

  if (labels.length === 0) return null

  return (
    <div
      role="group"
      aria-label={`${recipe.name} tags`}
      className={`flex flex-wrap gap-1.5 ${className}`}
    >
      {labels.map((label, index) => (
        <span
          key={`${label}-${index}`}
          className="rounded-full bg-white/90 px-2 py-1 text-[11px] font-semibold leading-none text-ink shadow-sm"
        >
          {label}
        </span>
      ))}
    </div>
  )
}
