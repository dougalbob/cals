import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../api/client'
import { getRecipe, updateRecipeMetadata } from '../api/recipes'
import {
  RECIPE_DISH_TYPES,
  RECIPE_MEAL_OCCASIONS,
  type RecipeDetail,
  type RecipeDishType,
  type RecipeMealOccasion,
  type RecipeMetadataInput,
} from '../api/types'
import { RecipeTags } from '../components/RecipeTags'
import { RecipePortionSheet } from '../components/RecipePortionSheet'
import { parseTagParam, recipesHref, toggleTag } from '../lib/recipeTags'

export function RecipeDetailRoute() {
  const { id: idParam } = useParams()
  const [searchParams] = useSearchParams()
  const [isLogging, setIsLogging] = useState(false)
  /**
   * The catalogue hands its tag filter down with the link (`?tags=`), so this
   * page can (a) return to the filtered list and (b) let a tag here open the
   * catalogue narrowed by it — or widened, when that tag is already active.
   */
  const carriedTags = useMemo(() => parseTagParam(searchParams.get('tags')), [searchParams])
  const recipeId = Number(idParam)
  const validId = Number.isInteger(recipeId) && recipeId > 0
  const queryClient = useQueryClient()
  const recipeQuery = useQuery({
    queryKey: queryKeys.recipe(recipeId),
    queryFn: () => getRecipe(recipeId),
    enabled: validId,
  })

  const metadataMutation = useMutation({
    mutationFn: (input: RecipeMetadataInput) => updateRecipeMetadata(recipeId, input),
    onSuccess: (updatedRecipe) => {
      queryClient.setQueryData(queryKeys.recipe(recipeId), updatedRecipe)
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes })
    },
  })

  if (!validId) {
    return <RecipeRouteMessage title="Recipe not found" message="That recipe link is not valid." />
  }
  if (recipeQuery.isPending) {
    return <p className="text-ink-light">Loading recipe…</p>
  }
  if (recipeQuery.isError || !recipeQuery.data) {
    return (
      <RecipeRouteMessage
        title="Could not load recipe"
        message={(recipeQuery.error as Error | undefined)?.message ?? 'Please try again.'}
      />
    )
  }

  const recipe = recipeQuery.data
  const ingredients = recipe.ingredients ?? []
  const textIngredients = recipe.text_ingredients ?? []
  const imageUrl = recipe.image_filename
    ? `/api/images/recipes/${recipe.id}/original${recipe.updated_at ? `?v=${encodeURIComponent(recipe.updated_at)}` : ''}`
    : null

  return (
    <div className="flex flex-col gap-4">
      <Link
        to={recipesHref(carriedTags)}
        className="min-h-11 self-start py-2 text-sm font-medium text-primary-dark no-underline hover:underline"
      >
        ← Back to recipes
      </Link>

      <article className="overflow-hidden rounded-2xl bg-card shadow-card">
        <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-emerald-700 via-green-600 to-green-900">
          {imageUrl ? (
            <img src={imageUrl} alt={recipe.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-white">
              <span aria-hidden="true" className="text-6xl drop-shadow">🍲</span>
              <span className="text-xs font-medium tracking-wide text-white/90">NO PHOTO YET</span>
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/65 to-transparent" />
          <RecipeTags
            recipe={recipe}
            selectedKeys={carriedTags}
            tagHref={(tag) => recipesHref(toggleTag(carriedTags, tag.key))}
            className="absolute bottom-4 left-4 right-4 z-10"
          />
        </div>

        <div className="p-4 sm:p-5">
          <h2 className="m-0 text-xl font-semibold">{recipe.name}</h2>
          {recipe.description && <p className="mb-0 mt-2 text-sm text-ink-light">{recipe.description}</p>}
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-b border-line-light pb-4 text-sm text-ink-light">
            <span className="font-semibold text-ink">{Math.round(recipe.total_calories)} kcal total</span>
            {recipe.total_weight_grams > 0 && <span>{Math.round(recipe.total_weight_grams)} g cooked</span>}
            {recipe.serves > 0 && <span>Serves {recipe.serves}</span>}
            {recipe.total_time_minutes !== null && <span>{recipe.total_time_minutes} min total</span>}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-4">
            <button
              type="button"
              onClick={() => setIsLogging(true)}
              className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white"
            >
              🍽 Add to diary
            </button>
            {recipe.usual_grams !== null ? (
              <span className="text-xs text-ink-light">
                Your usual portion: {Math.round(recipe.usual_grams)} g
              </span>
            ) : (
              <span className="text-xs text-ink-light">
                Choose a portion when you log it; the first one becomes your usual.
              </span>
            )}
          </div>

          <section className="pt-4" aria-labelledby="recipe-ingredients-title">
            <h3 id="recipe-ingredients-title" className="m-0 text-base font-semibold">Ingredients</h3>
            {ingredients.length === 0 && textIngredients.length === 0 ? (
              <p className="mb-0 mt-2 text-sm text-ink-light">No ingredients have been added yet.</p>
            ) : (
              <ul className="m-0 mt-2 divide-y divide-line-light p-0">
                {ingredients.map((ingredient) => (
                  <li key={`food-${ingredient.id}`} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                    <span>{ingredient.food_name}</span>
                    <span className="shrink-0 text-right tabular-nums text-ink-light">
                      {Math.round(ingredient.quantity_grams)} g
                      {typeof ingredient.calories === 'number' && ingredient.calories > 0 && (
                        <span> · {Math.round(ingredient.calories)} kcal</span>
                      )}
                    </span>
                  </li>
                ))}
                {textIngredients.map((ingredient) => (
                  <li key={`text-${ingredient.id}`} className="py-2 text-sm text-ink-light">
                    {ingredient.description}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <RecipeMetadataEditor
            key={recipe.id}
            recipe={recipe}
            isSaving={metadataMutation.isPending}
            error={metadataMutation.isError ? (metadataMutation.error as Error).message : null}
            onSave={(input) => metadataMutation.mutateAsync(input)}
          />

          {recipe.instructions && (
            <section className="border-t border-line-light pt-4" aria-labelledby="recipe-instructions-title">
              <h3 id="recipe-instructions-title" className="m-0 text-base font-semibold">Method</h3>
              <p className="mb-0 mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-light">
                {recipe.instructions}
              </p>
            </section>
          )}
        </div>
      </article>

      {isLogging && <RecipePortionSheet recipe={recipe} onClose={() => setIsLogging(false)} />}
    </div>
  )
}

function RecipeMetadataEditor({
  recipe,
  isSaving,
  error,
  onSave,
}: {
  recipe: RecipeDetail
  isSaving: boolean
  error: string | null
  onSave: (input: RecipeMetadataInput) => Promise<RecipeDetail>
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [mealOccasions, setMealOccasions] = useState<RecipeMealOccasion[]>(recipe.meal_occasions)
  const [dishType, setDishType] = useState<RecipeDishType | ''>(recipe.dish_type ?? '')
  const [keyFoodIds, setKeyFoodIds] = useState<number[]>(recipe.key_foods.map((food) => food.food_id))
  const [timeMinutes, setTimeMinutes] = useState(
    recipe.total_time_minutes === null ? '' : String(recipe.total_time_minutes),
  )

  const keyFoodChoices = useMemo(() => {
    const foods = new Map<number, string>()
    for (const ingredient of recipe.ingredients ?? []) foods.set(ingredient.food_id, ingredient.food_name)
    return [...foods.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [recipe.ingredients])

  const toggleOccasion = (occasion: RecipeMealOccasion, checked: boolean) => {
    setMealOccasions((current) =>
      checked ? [...current, occasion] : current.filter((item) => item !== occasion),
    )
  }

  const toggleKeyFood = (foodId: number, checked: boolean) => {
    setKeyFoodIds((current) => {
      if (checked) return current.length < 2 ? [...current, foodId] : current
      return current.filter((id) => id !== foodId)
    })
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const minutes = timeMinutes.trim() === '' ? null : Number(timeMinutes)
    if (minutes !== null && (!Number.isInteger(minutes) || minutes <= 0)) return
    try {
      await onSave({
        meal_occasions: RECIPE_MEAL_OCCASIONS
          .map((item) => item.value)
          .filter((occasion) => mealOccasions.includes(occasion)),
        dish_type: dishType,
        key_food_ids: keyFoodIds,
        total_time_minutes: minutes,
      })
      setIsEditing(false)
    } catch {
      // The parent mutation exposes the error beside this editor.
    }
  }

  return (
    <section className="mt-4 border-t border-line-light pt-4" aria-labelledby="recipe-tags-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="recipe-tags-title" className="m-0 text-base font-semibold">Recipe tags</h3>
          <p className="mb-0 mt-1 text-xs text-ink-light">Shared with everyone who uses this recipe.</p>
        </div>
        {!isEditing && (
          <button
            type="button"
            onClick={() => {
              setMealOccasions(recipe.meal_occasions)
              setDishType(recipe.dish_type ?? '')
              setKeyFoodIds(recipe.key_foods.map((food) => food.food_id))
              setTimeMinutes(recipe.total_time_minutes === null ? '' : String(recipe.total_time_minutes))
              setIsEditing(true)
            }}
            className="min-h-11 rounded-xl border border-primary px-4 text-sm font-semibold text-primary-dark hover:bg-primary/5"
          >
            Add tag
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-0 mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          Could not save recipe metadata: {error}
        </p>
      )}

      {isEditing && (
        <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-4 rounded-xl bg-surface p-3 sm:p-4">
          <fieldset className="m-0 flex flex-wrap gap-x-4 gap-y-2 border-0 p-0">
            <legend className="mb-2 text-sm font-semibold">Meal occasion</legend>
            {RECIPE_MEAL_OCCASIONS.map((occasion) => (
              <label key={occasion.value} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={mealOccasions.includes(occasion.value)}
                  onChange={(event) => toggleOccasion(occasion.value, event.target.checked)}
                  className="h-5 w-5 accent-primary"
                />
                {occasion.label}
              </label>
            ))}
          </fieldset>

          <label className="flex max-w-sm flex-col gap-1 text-sm font-medium">
            Dish type
            <select
              value={dishType}
              onChange={(event) => setDishType(event.target.value as RecipeDishType | '')}
              className="min-h-11 rounded-xl border border-line bg-card px-3"
            >
              <option value="">No dish type</option>
              {RECIPE_DISH_TYPES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>

          <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
            <legend className="mb-1 text-sm font-semibold">Key foods (choose up to two)</legend>
            {keyFoodChoices.length === 0 ? (
              <p className="m-0 text-sm text-ink-light">Add a cals Food ingredient before choosing a key food.</p>
            ) : (
              keyFoodChoices.map(([foodId, foodName]) => {
                const checked = keyFoodIds.includes(foodId)
                return (
                  <label key={foodId} className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && keyFoodIds.length >= 2}
                      onChange={(event) => toggleKeyFood(foodId, event.target.checked)}
                      className="h-5 w-5 accent-primary"
                    />
                    {foodName}
                  </label>
                )
              })
            )}
          </fieldset>

          <label className="flex max-w-sm flex-col gap-1 text-sm font-medium">
            Total prep-to-plate time (minutes)
            <input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={timeMinutes}
              onChange={(event) => setTimeMinutes(event.target.value)}
              placeholder="Optional"
              className="min-h-11 rounded-xl border border-line bg-card px-3"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={isSaving}
              className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isSaving ? 'Saving…' : 'Save tags and time'}
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => {
                setMealOccasions(recipe.meal_occasions)
                setDishType(recipe.dish_type ?? '')
                setKeyFoodIds(recipe.key_foods.map((food) => food.food_id))
                setTimeMinutes(recipe.total_time_minutes === null ? '' : String(recipe.total_time_minutes))
                setIsEditing(false)
              }}
              className="min-h-11 rounded-xl border border-line px-4 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

function RecipeRouteMessage({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col gap-3">
      <Link to="/recipes" className="min-h-11 self-start py-2 text-sm font-medium text-primary-dark no-underline hover:underline">
        ← Back to recipes
      </Link>
      <p role="alert" className="m-0 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
        {title}: {message}
      </p>
    </div>
  )
}
