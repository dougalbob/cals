import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet, queryKeys } from '../api/client'
import { getFood } from '../api/foods'
import type { Food, RecipeContentInput, RecipeDetail } from '../api/types'
import { Modal } from './Modal'
import { useDebounced } from '../hooks/useDebounced'
import { formatNumber } from '../lib/format'

interface FoodIngredientDraft {
  key: number
  food_id: number
  food_name: string
  quantity_grams: string
}

interface TextIngredientDraft {
  key: number
  description: string
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
  const [description, setDescription] = useState(recipe.description ?? '')
  const [instructions, setInstructions] = useState(recipe.instructions ?? '')
  const [serves, setServes] = useState(String(Math.max(1, recipe.serves)))
  const [weightIsManual, setWeightIsManual] = useState(recipe.weight_is_manual)
  const [manualWeight, setManualWeight] = useState(
    recipe.total_weight_grams > 0 ? String(recipe.total_weight_grams) : '',
  )
  const [ingredients, setIngredients] = useState<FoodIngredientDraft[]>(() =>
    (recipe.ingredients ?? []).map((ingredient) => ({
      key: ingredient.id,
      food_id: ingredient.food_id,
      food_name: ingredient.food_name,
      quantity_grams: String(ingredient.quantity_grams),
    })),
  )
  const [textIngredients, setTextIngredients] = useState<TextIngredientDraft[]>(() =>
    (recipe.text_ingredients ?? []).map((ingredient) => ({
      key: ingredient.id,
      description: ingredient.description,
    })),
  )
  const [nextKey, setNextKey] = useState(() => {
    const keys = [
      ...(recipe.ingredients ?? []).map((ingredient) => ingredient.id),
      ...(recipe.text_ingredients ?? []).map((ingredient) => ingredient.id),
    ]
    return Math.max(0, ...keys) + 1
  })
  const [foodSearch, setFoodSearch] = useState('')
  const [resolutionError, setResolutionError] = useState<string | null>(null)
  const [resolvingFood, setResolvingFood] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
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
        { key: nextKey, food_id: food.id as number, food_name: food.name, quantity_grams: '100' },
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

  const addTextIngredient = () => {
    setTextIngredients((current) => [...current, { key: nextKey, description: '' }])
    setNextKey((key) => key + 1)
  }

  const updateTextIngredient = (key: number, description: string) => {
    setTextIngredients((current) => current.map((ingredient) =>
      ingredient.key === key ? { ...ingredient, description } : ingredient,
    ))
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setValidationError(null)

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

    try {
      await onSave({
        name: recipe.name,
        description: description.trim(),
        instructions: instructions.trim(),
        serves: servesValue,
        total_weight_grams: weightIsManual ? manualWeightValue : 0,
        weight_is_manual: weightIsManual,
        ingredients: foodInputs,
        text_ingredients: textInputs,
      })
      onClose()
    } catch {
      // The parent mutation displays its API error above the form.
    }
  }

  const close = () => {
    if (!isSaving) onClose()
  }

  const visibleResults = foodSearch.trim().length >= 2 ? searchQuery.data ?? [] : []

  return (
    <Modal open title={`Edit ${recipe.name}`} onClose={close}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="m-0 rounded-xl bg-primary/10 px-3 py-2 text-sm text-ink-light">
          Changes apply to future recipe logs. Anything already saved in the Diary keeps its grams and nutrition.
        </p>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Recipe name · fixed
          <input
            aria-label="Recipe name (fixed)"
            value={recipe.name}
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

        <section aria-labelledby="edit-recipe-foods-title">
          <h3 id="edit-recipe-foods-title" className="m-0 text-sm font-semibold">Food ingredients</h3>
          {ingredients.length === 0 ? (
            <p className="mb-0 mt-1 text-sm text-ink-light">No cals Foods added yet.</p>
          ) : (
            <ul className="m-0 mt-2 list-none divide-y divide-line-light p-0">
              {ingredients.map((ingredient, index) => (
                <li key={ingredient.key} className="flex items-end gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate text-sm font-medium">{ingredient.food_name}</p>
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
                  <button
                    type="button"
                    onClick={() => setIngredients((current) => current.filter((item) => item.key !== ingredient.key))}
                    aria-label={`Remove ${ingredient.food_name}`}
                    className="min-h-10 rounded-lg border border-line px-3 text-sm text-ink-light"
                  >
                    Remove
                  </button>
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
            <ul className="m-0 mt-2 max-h-40 list-none divide-y divide-line-light overflow-y-auto rounded-xl border border-line p-0">
              {visibleResults.map((food) => (
                <li key={String(food.id)} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0 text-sm">
                    {food.name}
                    {food.brand ? <span className="text-ink-light"> · {food.brand}</span> : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => void addFood(food)}
                    disabled={resolvingFood !== null}
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

        <section aria-labelledby="edit-recipe-text-title">
          <div className="flex items-center justify-between gap-2">
            <h3 id="edit-recipe-text-title" className="m-0 text-sm font-semibold">Text ingredients</h3>
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
                <li key={ingredient.key} className="flex items-center gap-2 py-1">
                  <input
                    aria-label={`Text ingredient ${index + 1}`}
                    value={ingredient.description}
                    onChange={(event) => updateTextIngredient(ingredient.key, event.target.value)}
                    placeholder="For example, a pinch of salt"
                    className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setTextIngredients((current) => current.filter((item) => item.key !== ingredient.key))}
                    aria-label={`Remove text ingredient ${index + 1}`}
                    className="min-h-10 rounded-lg border border-line px-3 text-sm text-ink-light"
                  >
                    Remove
                  </button>
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
                className="min-h-11 rounded-xl border border-line bg-card px-3 text-base"
              />
            </label>
          ) : (
            <p className="m-0 text-sm text-ink-light">
              Calculated from food quantities: {formatNumber(calculatedWeight, 1)} g. Switch on the box above to use a measured cooked weight.
            </p>
          )}
        </section>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Method / instructions
          <textarea
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            rows={5}
            className="min-h-28 rounded-xl border border-line bg-surface px-3 py-2 text-base"
          />
        </label>

        {(validationError || error) && (
          <p role="alert" className="m-0 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
            {validationError ?? `Could not save recipe: ${error}`}
          </p>
        )}

        <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap justify-end gap-2 border-t border-line bg-card p-4">
          <button
            type="button"
            onClick={close}
            disabled={isSaving}
            className="min-h-11 rounded-xl border border-line px-4 text-sm font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving || resolvingFood !== null}
            className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : 'Save recipe'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
