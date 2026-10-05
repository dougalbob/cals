import { useId, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet, queryKeys } from '../api/client'
import { getFood } from '../api/foods'
import type {
  Food,
  RecipeContentInput,
  RecipeCreateInput,
  RecipeDetail,
  RecipeDishType,
  RecipeMealOccasion,
} from '../api/types'
import { RECIPE_DISH_TYPES, RECIPE_MEAL_OCCASIONS } from '../api/types'
import { useDebounced } from '../hooks/useDebounced'
import { formatNumber } from '../lib/format'
import { Modal } from './Modal'
import { RecipePhotoPicker } from './RecipePhotoPicker'

interface FoodIngredientDraft {
  key: number
  food_id: number
  food_name: string
  quantity_grams: string
  calories_per_100g?: number
  protein_per_100g?: number
  carbs_per_100g?: number
  fat_per_100g?: number
  fibre_per_100g?: number
}

interface TextIngredientDraft {
  key: number
  description: string
}

type AuthoringFieldsProps =
  | {
      mode: 'edit'
      recipe: RecipeDetail
      isSaving: boolean
      error: string | null
      onSave: (input: RecipeContentInput) => Promise<RecipeDetail>
      onClose: () => void
    }
  | {
      mode: 'create'
      isSaving: boolean
      error: string | null
      onCreate: (input: RecipeCreateInput, photoFile: File | null) => Promise<RecipeDetail>
      onClose: () => void
    }

/**
 * Edit the shared content of an existing recipe. The name is deliberately
 * read-only; the server independently enforces that rule for older clients.
 */
export function RecipeContentEditor({
  recipe,
  isSaving,
  error,
  onSave,
  onClose,
}: {
  recipe: RecipeDetail
  isSaving: boolean
  error: string | null
  onSave: (input: RecipeContentInput) => Promise<RecipeDetail>
  onClose: () => void
}) {
  const close = () => {
    if (!isSaving) onClose()
  }

  return (
    <Modal open title={`Edit ${recipe.name}`} onClose={close}>
      <RecipeAuthoringFields
        mode="edit"
        recipe={recipe}
        isSaving={isSaving}
        error={error}
        onSave={onSave}
        onClose={close}
      />
    </Modal>
  )
}

/** Full-page recipe creation with an optional direct image upload (no crop). */
export function RecipeCreationForm({
  isSaving,
  error,
  onCreate,
  onCancel,
}: {
  isSaving: boolean
  error: string | null
  onCreate: (input: RecipeCreateInput, photoFile: File | null) => Promise<RecipeDetail>
  onCancel: () => void
}) {
  const cancel = () => {
    if (!isSaving) onCancel()
  }

  return (
    <RecipeAuthoringFields
      mode="create"
      isSaving={isSaving}
      error={error}
      onCreate={onCreate}
      onClose={cancel}
    />
  )
}

function RecipeAuthoringFields(props: AuthoringFieldsProps) {
  const recipe = props.mode === 'edit' ? props.recipe : undefined
  const isCreating = props.mode === 'create'

  const [name, setName] = useState(recipe?.name ?? '')
  const [description, setDescription] = useState(recipe?.description ?? '')
  const [instructions, setInstructions] = useState(recipe?.instructions ?? '')
  const [serves, setServes] = useState(String(Math.max(1, recipe?.serves ?? 1)))
  const [weightIsManual, setWeightIsManual] = useState(recipe?.weight_is_manual ?? false)
  const [manualWeight, setManualWeight] = useState(
    recipe && recipe.total_weight_grams > 0 ? String(recipe.total_weight_grams) : '',
  )
  const [ingredients, setIngredients] = useState<FoodIngredientDraft[]>(() =>
    (recipe?.ingredients ?? []).map((ingredient) => ({
      key: ingredient.id,
      food_id: ingredient.food_id,
      food_name: ingredient.food_name,
      quantity_grams: String(ingredient.quantity_grams),
    })),
  )
  const [textIngredients, setTextIngredients] = useState<TextIngredientDraft[]>(() =>
    (recipe?.text_ingredients ?? []).map((ingredient) => ({
      key: ingredient.id,
      description: ingredient.description,
    })),
  )
  const [nextKey, setNextKey] = useState(() => {
    const keys = [
      ...(recipe?.ingredients ?? []).map((ingredient) => ingredient.id),
      ...(recipe?.text_ingredients ?? []).map((ingredient) => ingredient.id),
    ]
    return Math.max(0, ...keys) + 1
  })
  const [foodSearch, setFoodSearch] = useState('')
  const [resolutionError, setResolutionError] = useState<string | null>(null)
  const [resolvingFood, setResolvingFood] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const cookedWeightHintId = useId()

  // Creation shares the same controlled classification vocabulary as Add tag
  // and Edit recipe. These are household recipe fields, not user preferences.
  const [mealOccasions, setMealOccasions] = useState<RecipeMealOccasion[]>([])
  const [dishType, setDishType] = useState<RecipeDishType | ''>('')
  const [isOwnCreation, setIsOwnCreation] = useState(false)
  const [keyFoodIds, setKeyFoodIds] = useState<number[]>([])
  const [timeMinutes, setTimeMinutes] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)

  const debouncedSearch = useDebounced(foodSearch, 250)
  const searchQuery = useQuery<Food[]>({
    queryKey: queryKeys.foodSearch(debouncedSearch),
    queryFn: () => apiGet<Food[]>(`/api/foods/search?q=${encodeURIComponent(debouncedSearch)}`),
    enabled: debouncedSearch.trim().length >= 2,
  })

  const calculatedWeight = ingredients.reduce((total, ingredient) => {
    const grams = Number(ingredient.quantity_grams)
    return Number.isFinite(grams) && grams > 0 ? total + grams : total
  }, 0)

  const estimatedCalories = ingredients.reduce((total, ingredient) => {
    const grams = Number(ingredient.quantity_grams)
    if (!Number.isFinite(grams) || grams <= 0) return total
    return total + ((ingredient.calories_per_100g ?? 0) * grams) / 100
  }, 0)
  const estimateWeight = weightIsManual && Number(manualWeight) > 0
    ? Number(manualWeight)
    : calculatedWeight
  const estimatedCaloriesPer100g = estimateWeight > 0 ? (estimatedCalories / estimateWeight) * 100 : 0

  const keyFoodChoices = useMemo(() => {
    const foods = new Map<number, string>()
    for (const ingredient of ingredients) foods.set(ingredient.food_id, ingredient.food_name)
    return [...foods.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [ingredients])

  const addFood = async (result: Food) => {
    setResolutionError(null)
    setResolvingFood(String(result.id))
    try {
      // FatSecret search hits use `fs_<id>`. Resolve/cache one before allowing it
      // into a recipe, whose persisted ingredient must reference a local Food.
      const food = typeof result.id === 'number' ? result : await getFood(result.id)
      if (typeof food.id !== 'number' || !Number.isInteger(food.id) || food.id <= 0) {
        throw new Error('This food could not be saved to the local food catalogue.')
      }
      setIngredients((current) => [
        ...current,
        {
          key: nextKey,
          food_id: food.id as number,
          food_name: food.name,
          quantity_grams: '100',
          calories_per_100g: food.calories_per_100g,
          protein_per_100g: food.protein_per_100g,
          carbs_per_100g: food.carbs_per_100g,
          fat_per_100g: food.fat_per_100g,
          fibre_per_100g: food.fibre_per_100g,
        },
      ])
      setNextKey((key) => key + 1)
      setFoodSearch('')
    } catch (caught) {
      setResolutionError((caught as Error).message)
    } finally {
      setResolvingFood(null)
    }
  }

  const updateFoodLine = (key: number, quantity: string) => {
    setIngredients((current) => current.map((ingredient) =>
      ingredient.key === key ? { ...ingredient, quantity_grams: quantity } : ingredient,
    ))
  }

  const removeFoodLine = (ingredient: FoodIngredientDraft) => {
    setIngredients((current) => current.filter((item) => item.key !== ingredient.key))
    if (!ingredients.some((item) => item.key !== ingredient.key && item.food_id === ingredient.food_id)) {
      setKeyFoodIds((current) => current.filter((foodId) => foodId !== ingredient.food_id))
    }
  }

  const addTextIngredient = () => {
    setTextIngredients((current) => [...current, { key: nextKey, description: '' }])
    setNextKey((key) => key + 1)
  }

  const updateTextIngredient = (key: number, text: string) => {
    setTextIngredients((current) => current.map((ingredient) =>
      ingredient.key === key ? { ...ingredient, description: text } : ingredient,
    ))
  }

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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setValidationError(null)

    const nameValue = name.trim()
    if (isCreating && !nameValue) {
      setValidationError('Recipe name is required.')
      return
    }

    const servesValue = Number(serves)
    if (!Number.isInteger(servesValue) || servesValue < 1) {
      setValidationError('Serves must be a whole number greater than zero.')
      return
    }

    const foodInputs = []
    for (const ingredient of ingredients) {
      const grams = Number(ingredient.quantity_grams)
      if (!Number.isFinite(grams) || grams <= 0) {
        setValidationError(`Enter a food weight greater than zero for ${ingredient.food_name}.`)
        return
      }
      foodInputs.push({ food_id: ingredient.food_id, quantity_grams: grams, sort_order: foodInputs.length })
    }

    const manualWeightValue = Number(manualWeight)
    if (weightIsManual && (!Number.isFinite(manualWeightValue) || manualWeightValue <= 0)) {
      setValidationError('Enter a measured cooked weight greater than zero grams.')
      return
    }

    const textInputs = textIngredients
      .map((ingredient) => ingredient.description.trim())
      .filter(Boolean)
      .map((ingredient, sort_order) => ({ description: ingredient, sort_order }))

    const minutes = timeMinutes.trim() === '' ? null : Number(timeMinutes)
    if (isCreating && minutes !== null && (!Number.isInteger(minutes) || minutes <= 0)) {
      setValidationError('Total time must be a whole number of minutes greater than zero.')
      return
    }

    const content: RecipeContentInput = {
      name: isCreating ? nameValue : (recipe as RecipeDetail).name,
      description: description.trim(),
      instructions: instructions.trim(),
      serves: servesValue,
      total_weight_grams: weightIsManual ? manualWeightValue : 0,
      weight_is_manual: weightIsManual,
      ingredients: foodInputs,
      text_ingredients: textInputs,
    }

    try {
      if (props.mode === 'create') {
        await props.onCreate({
          ...content,
          meal_occasions: RECIPE_MEAL_OCCASIONS
            .map((item) => item.value)
            .filter((occasion) => mealOccasions.includes(occasion)),
          dish_type: dishType,
          key_food_ids: keyFoodIds,
          is_own_creation: isOwnCreation,
          total_time_minutes: minutes,
        }, photoFile)
      } else {
        await props.onSave(content)
        props.onClose()
      }
    } catch {
      // The parent mutation displays its API error above the form.
    }
  }

  const close = () => {
    if (!props.isSaving) props.onClose()
  }

  const visibleResults = foodSearch.trim().length >= 2 ? searchQuery.data ?? [] : []

  return (
    <form
      onSubmit={submit}
      onChange={() => setValidationError(null)}
      className="flex flex-col gap-4"
    >
      {isCreating ? (
        <>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Recipe name
            <input
              aria-label="Recipe name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g., Lentil & roast pepper soup"
              autoComplete="off"
              className="min-h-11 rounded-xl border border-line bg-surface px-3 text-base"
            />
            <span className="text-xs font-normal text-ink-light">Choose carefully — the name is fixed after creation.</span>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              placeholder="A short note to help you recognise it"
              className="min-h-20 rounded-xl border border-line bg-surface px-3 py-2 text-base"
            />
          </label>
        </>
      ) : (
        <>
          <p className="m-0 rounded-xl bg-primary/10 px-3 py-2 text-sm text-ink-light">
            Changes apply to future recipe logs. Anything already saved in the Diary keeps its grams and nutrition.
          </p>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Recipe name · fixed
            <input
              aria-label="Recipe name (fixed)"
              value={recipe?.name ?? ''}
              readOnly
              className="min-h-11 rounded-xl border border-line bg-surface px-3 text-base text-ink-light"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              className="min-h-20 rounded-xl border border-line bg-surface px-3 py-2 text-base"
            />
          </label>
        </>
      )}

      {isCreating && (
        <RecipePhotoPicker
          variant="form"
          recipeName={name || 'New recipe'}
          currentImageUrl={null}
          selectedFile={photoFile}
          onFileChange={setPhotoFile}
        />
      )}

      <section aria-labelledby={isCreating ? 'create-recipe-foods-title' : 'edit-recipe-foods-title'}>
        <h3
          id={isCreating ? 'create-recipe-foods-title' : 'edit-recipe-foods-title'}
          className="m-0 text-sm font-semibold"
        >
          Food ingredients
        </h3>
        {ingredients.length === 0 ? (
          <p className="mb-0 mt-1 text-sm text-ink-light">
            No cals Foods added yet. Add known Foods to calculate nutrition and enable Diary portions.
          </p>
        ) : (
          <ul className="m-0 mt-2 list-none divide-y divide-line-light p-0">
            {ingredients.map((ingredient, index) => (
              <li key={ingredient.key} className="flex flex-wrap items-end gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="m-0 break-words text-sm font-medium">{ingredient.food_name}</p>
                  <label className="mt-1 flex items-center gap-2 text-xs text-ink-light">
                    <span>Weight (g)</span>
                    <input
                      aria-label={`${ingredient.food_name} weight (grams) ${index + 1}`}
                      type="number"
                      min="0.1"
                      step="any"
                      inputMode="decimal"
                      value={ingredient.quantity_grams}
                      onChange={(event) => updateFoodLine(ingredient.key, event.target.value)}
                      className="min-h-10 w-28 rounded-lg border border-line bg-surface px-2 text-sm tabular-nums text-ink"
                    />
                  </label>
                </div>
                <IngredientRemoveButton
                  label={`Remove ${ingredient.food_name}`}
                  onRemove={() => removeFoodLine(ingredient)}
                />
              </li>
            ))}
          </ul>
        )}

        <label className="mt-3 flex flex-col gap-1 text-sm font-medium">
          Search cals Foods to add
          <input
            type="search"
            value={foodSearch}
            onChange={(event) => {
              setFoodSearch(event.target.value)
              setResolutionError(null)
            }}
            placeholder="Type at least two characters…"
            className="min-h-11 rounded-xl border border-line bg-surface px-3 text-base"
          />
        </label>
        {searchQuery.isFetching && <p className="m-0 mt-2 text-sm text-ink-light">Searching foods…</p>}
        {searchQuery.isError && (
          <p role="alert" className="m-0 mt-2 text-sm text-danger">
            Could not search foods: {(searchQuery.error as Error).message}
          </p>
        )}
        {visibleResults.length > 0 && (
          <ul
            aria-label="Food search results"
            className="m-0 mt-2 max-h-48 list-none divide-y divide-line-light overflow-y-auto rounded-xl border border-line p-0"
          >
            {visibleResults.map((food) => (
              <li key={String(food.id)} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 text-sm">
                  {food.name}
                  {food.brand ? <span className="text-ink-light"> · {food.brand}</span> : null}
                  <span className="block text-xs text-ink-light">
                    {formatNumber(food.calories_per_100g)} kcal / 100 g
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void addFood(food)}
                  disabled={resolvingFood !== null}
                  aria-label={`Add ${food.name} to recipe`}
                  className="min-h-10 shrink-0 rounded-lg border border-primary px-3 text-sm font-medium text-primary-dark disabled:opacity-50"
                >
                  {resolvingFood === String(food.id) ? 'Adding…' : 'Add'}
                </button>
              </li>
            ))}
          </ul>
        )}
        {foodSearch.trim().length >= 2 && !searchQuery.isFetching && visibleResults.length === 0 && !searchQuery.isError && (
          <p className="m-0 mt-2 text-sm text-ink-light">No foods found.</p>
        )}
        {resolutionError && <p role="alert" className="m-0 mt-2 text-sm text-danger">{resolutionError}</p>}
      </section>

      <section aria-labelledby={isCreating ? 'create-recipe-text-title' : 'edit-recipe-text-title'}>
        <div className="flex items-center justify-between gap-2">
          <h3
            id={isCreating ? 'create-recipe-text-title' : 'edit-recipe-text-title'}
            className="m-0 text-sm font-semibold"
          >
            Text ingredients
          </h3>
          <button
            type="button"
            onClick={addTextIngredient}
            className="min-h-10 rounded-lg border border-primary px-3 text-sm font-medium text-primary-dark"
          >
            + Add text ingredient
          </button>
        </div>
        {textIngredients.length === 0 ? (
          <p className="mb-0 mt-1 text-sm text-ink-light">Optional notes such as “a pinch of salt”.</p>
        ) : (
          <ul className="m-0 mt-2 list-none p-0">
            {textIngredients.map((ingredient, index) => (
              <li key={ingredient.key} className="flex flex-wrap items-center gap-2 py-1">
                <input
                  aria-label={`Text ingredient ${index + 1}`}
                  value={ingredient.description}
                  onChange={(event) => updateTextIngredient(ingredient.key, event.target.value)}
                  placeholder="For example, a pinch of salt"
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm"
                />
                <IngredientRemoveButton
                  label={`Remove text ingredient ${index + 1}`}
                  onRemove={() =>
                    setTextIngredients((current) => current.filter((item) => item.key !== ingredient.key))
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Serves
        <input
          aria-label="Serves"
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          value={serves}
          onChange={(event) => setServes(event.target.value)}
          className="min-h-11 w-32 rounded-xl border border-line bg-surface px-3 text-base"
        />
      </label>

      <section className="rounded-xl bg-surface p-3" aria-label="Cooked weight">
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={weightIsManual}
            onChange={(event) => setWeightIsManual(event.target.checked)}
            className="h-5 w-5 accent-primary"
          />
          I measured the cooked weight
        </label>
        {weightIsManual ? (
          <label className="mt-2 flex flex-col gap-1 text-sm font-medium">
            Cooked weight (grams)
            <input
              aria-label="Cooked weight (grams)"
              type="number"
              min="0.1"
              step="any"
              inputMode="decimal"
              value={manualWeight}
              onChange={(event) => setManualWeight(event.target.value)}
              aria-describedby={cookedWeightHintId}
              className="min-h-11 rounded-xl border border-line bg-card px-3 text-base"
            />
            <p id={cookedWeightHintId} className="m-0 mt-2 text-xs font-normal text-ink-light">
              The foods in this recipe add up to{' '}
              <span className="font-semibold tabular-nums text-ink">{formatNumber(calculatedWeight, 1)} g</span>.
              If nothing was lost in cooking, type that figure in — it is a hint, never saved by itself.
            </p>
          </label>
        ) : (
          <p className="m-0 text-sm text-ink-light">
            Calculated from food quantities: {formatNumber(calculatedWeight, 1)} g. Switch on the box above to use a measured cooked weight.
          </p>
        )}
      </section>

      {isCreating && (
        <section className="rounded-xl border border-primary/20 bg-primary/5 p-3" aria-label="Nutrition estimate">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="m-0 text-sm font-semibold">Estimated nutrition</h3>
            <span className="text-sm font-semibold tabular-nums">
              {formatNumber(estimatedCalories, 1)} kcal total
            </span>
          </div>
          <p className="mb-0 mt-1 text-sm tabular-nums text-ink-light">
            {formatNumber(estimatedCaloriesPer100g, 1)} kcal / 100 g cooked · {formatNumber(estimateWeight, 1)} g yield
          </p>
          <p className="mb-0 mt-1 text-xs text-ink-light">
            Calculated from cals Food ingredients; text ingredients are not included.
          </p>
        </section>
      )}

      {isCreating && (
        <section className="flex flex-col gap-4 border-t border-line-light pt-4" aria-labelledby="recipe-classification-title">
          <div>
            <h3 id="recipe-classification-title" className="m-0 text-base font-semibold">Recipe details</h3>
            <p className="mb-0 mt-1 text-xs text-ink-light">Shared tags help both of you find this recipe later.</p>
          </div>

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
              className="min-h-11 rounded-xl border border-line bg-surface px-3"
            >
              <option value="">No dish type</option>
              {RECIPE_DISH_TYPES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>

          <fieldset className="m-0 rounded-xl border border-orange-300 bg-orange-50 p-3">
            <legend className="px-1 text-sm font-semibold text-orange-950">Recipe origin</legend>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                aria-label="Own creation"
                checked={isOwnCreation}
                onChange={(event) => setIsOwnCreation(event.target.checked)}
                className="h-5 w-5 accent-orange-600"
              />
              <span className="rounded-full bg-orange-200 px-2.5 py-1 text-xs font-semibold text-orange-950">
                Own creation
              </span>
              <span className="text-ink-light">Created by someone in your household.</span>
            </label>
          </fieldset>

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
              aria-label="Total prep-to-plate time (minutes)"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={timeMinutes}
              onChange={(event) => setTimeMinutes(event.target.value)}
              placeholder="Optional"
              className="min-h-11 rounded-xl border border-line bg-surface px-3"
            />
          </label>
        </section>
      )}

      <label className="flex flex-col gap-1 text-sm font-medium">
        Method / instructions
        <textarea
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          rows={5}
          className="min-h-28 rounded-xl border border-line bg-surface px-3 py-2 text-base"
        />
      </label>

      {(validationError || props.error) && (
        <p role="alert" className="m-0 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {validationError ?? `${isCreating ? 'Could not create' : 'Could not save'} recipe: ${props.error}`}
        </p>
      )}

      <div className={isCreating
        ? '-mx-4 -mb-4 flex flex-wrap justify-end gap-2 border-t border-line bg-card p-4'
        : 'sticky bottom-0 -mx-4 -mb-4 flex flex-wrap justify-end gap-2 border-t border-line bg-card p-4'}
      >
        <button
          type="button"
          onClick={close}
          disabled={props.isSaving}
          className="min-h-11 rounded-xl border border-line px-4 text-sm font-medium disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={props.isSaving || resolvingFood !== null}
          className={`${isCreating ? 'scroll-mb-24 ' : ''}min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50`}
        >
          {props.isSaving ? (isCreating ? 'Creating…' : 'Saving…') : (isCreating ? 'Create recipe' : 'Save recipe')}
        </button>
      </div>
    </form>
  )
}

/**
 * Ingredient removal asks first, in place — the same two-button check the
 * Archive recipe button uses. A slip while editing a recipe must not drop an
 * ingredient (and, with it, a key food) without confirmation.
 */
function IngredientRemoveButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={label}
        className="min-h-10 shrink-0 rounded-lg border border-line px-3 text-sm text-ink-light"
      >
        Remove
      </button>
    )
  }

  return (
    <span className="flex shrink-0 items-center gap-2" role="group" aria-label={`Confirm ${label.toLowerCase()}`}>
      <button
        type="button"
        onClick={onRemove}
        className="min-h-10 rounded-lg bg-danger px-3 text-sm font-semibold text-white"
      >
        Yes, remove
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="min-h-10 rounded-lg border border-line px-3 text-sm font-medium"
      >
        Keep
      </button>
    </span>
  )
}

