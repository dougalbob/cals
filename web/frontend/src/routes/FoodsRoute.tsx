import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, queryKeys } from '../api/client'
import { createFood, deleteFood, getCustomFoods, getFood, updateFood } from '../api/foods'
import type { Food, FoodInput, FoodServingInput } from '../api/types'
import { Modal } from '../components/Modal'
import { useDebounced } from '../hooks/useDebounced'
import { formatNumber } from '../lib/format'
import { servingChoices } from '../lib/foodServings'

export function FoodsRoute() {
  const [term, setTerm] = useState('')
  const [editing, setEditing] = useState<Food | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Food | null>(null)
  // A FatSecret hit has no local row yet; saving it caches the food and its
  // measures, then opens the editor so its values can be corrected.
  const [savingFromFatSecret, setSavingFromFatSecret] = useState<string | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const debounced = useDebounced(term, 250)

  const search = useQuery<Food[]>({
    queryKey: queryKeys.foodSearch(debounced),
    queryFn: () => apiGet<Food[]>(`/api/foods/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.trim().length >= 2,
  })

  const custom = useQuery<Food[]>({
    queryKey: queryKeys.customFoods,
    queryFn: getCustomFoods,
  })

  const invalidateFoods = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.customFoods })
    void queryClient.invalidateQueries({ queryKey: queryKeys.foodSearchAll })
    // Correcting a food also refreshes every dependent recipe definition.
    void queryClient.invalidateQueries({ queryKey: queryKeys.recipes })
  }

  const removeFood = useMutation({
    mutationFn: (food: Food) => deleteFood(food.id as number),
    onSuccess: () => {
      setDeleting(null)
      invalidateFoods()
    },
  })

  /**
   * Save a FatSecret result into the local catalogue and open it for editing.
   * The GET is the cache: it writes the food and its FatSecret measures, then
   * the editor lets the household correct the values and add its own measures.
   */
  const saveFromFatSecret = async (food: Food) => {
    setResolveError(null)
    setSavingFromFatSecret(String(food.id))
    try {
      const saved = await getFood(food.id)
      if (typeof saved.id !== 'number') {
        throw new Error('That food could not be saved to your list.')
      }
      invalidateFoods()
      setEditing(saved)
    } catch (caught) {
      setResolveError((caught as Error).message)
    } finally {
      setSavingFromFatSecret(null)
    }
  }

  const showSearch = debounced.trim().length >= 2

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl bg-card p-4 shadow-card">
        <h2 className="m-0 mb-2 text-base font-semibold">🔍 Search foods</h2>
        <input
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search local foods (FatSecret when configured)…"
          className="w-full min-h-11 rounded-xl border border-line px-3 text-base"
        />

        {showSearch && (
          <>
            {search.isFetching && <p className="text-sm text-ink-light mt-2 mb-0">Searching…</p>}
            <ul className="list-none m-0 p-0 mt-2">
              {(search.data ?? []).map((food) => (
                <FoodRow
                  key={String(food.id)}
                  food={food}
                  onEdit={setEditing}
                  onSaveFromFatSecret={(hit) => void saveFromFatSecret(hit)}
                  savingFromFatSecret={savingFromFatSecret === String(food.id)}
                  savingDisabled={savingFromFatSecret !== null}
                />
              ))}
            </ul>
            {resolveError && (
              <p role="alert" className="m-0 mt-2 text-sm text-danger">
                {resolveError}
              </p>
            )}
            {!search.isFetching && (search.data ?? []).length === 0 && (
              <p className="text-sm text-ink-muted mt-2 mb-0">No matches.</p>
            )}
          </>
        )}
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="m-0 text-base font-semibold">🥗 My foods</h2>
            <p className="m-0 mt-1 text-xs text-ink-light">
              {custom.data?.length ?? 0} custom {custom.data?.length === 1 ? 'food' : 'foods'} you can edit and delete
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white"
          >
            + New food
          </button>
        </div>

        {custom.isPending ? (
          <p className="text-sm text-ink-light m-0 mt-3">Loading…</p>
        ) : (custom.data ?? []).length === 0 ? (
          <p className="text-sm text-ink-muted m-0 mt-3">
            No custom foods yet. Add one to log it by name — and give it real measures such as “1 bag = 25 g”.
          </p>
        ) : (
          <ul className="list-none m-0 p-0 mt-2">
            {(custom.data ?? []).map((food) => (
              <FoodRow
                key={String(food.id)}
                food={food}
                onEdit={setEditing}
                onDelete={() => setDeleting(food)}
              />
            ))}
          </ul>
        )}

        {removeFood.isError && (
          <p role="alert" className="m-0 mt-2 text-sm text-danger">
            {(removeFood.error as Error).message}
          </p>
        )}
      </section>

      {editing !== null && (
        <FoodEditorModal
          key={editing === 'new' ? 'new' : String(editing.id)}
          food={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={invalidateFoods}
        />
      )}

      <Modal open={deleting !== null} title={`Delete ${deleting?.name ?? ''}?`} onClose={() => setDeleting(null)}>
        {deleting && (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-sm text-ink">
              Delete this food? Past diary entries keep their own saved nutrition, so logged days are unaffected.
            </p>
            {(deleting.servings ?? []).length > 0 && (
              <p className="m-0 text-sm text-ink-light">Its named measures are deleted too.</p>
            )}
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleting(null)}
                className="min-h-10 rounded-xl border border-line bg-surface px-3.5 text-sm text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={removeFood.isPending}
                onClick={() => removeFood.mutate(deleting)}
                className="min-h-10 rounded-xl bg-danger px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                {removeFood.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function FoodRow({
  food,
  onEdit,
  onDelete,
  onSaveFromFatSecret,
  savingFromFatSecret = false,
  savingDisabled = false,
}: {
  food: Food
  onEdit: (food: Food) => void
  onDelete?: () => void
  /** Present on search results: saves a FatSecret hit into the local catalogue. */
  onSaveFromFatSecret?: (food: Food) => void
  savingFromFatSecret?: boolean
  savingDisabled?: boolean
}) {
  const editable = typeof food.id === 'number'
  const fromFatSecret = typeof food.id === 'string'
  const measures = servingChoices(food)

  return (
    <li className="py-2.5 border-b border-line-light last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-sm font-medium break-words">
            {food.name}
            {food.brand ? <span className="text-ink-light font-normal"> · {food.brand}</span> : null}
          </p>
          <p className="m-0 text-xs text-ink-light">
            {formatNumber(food.calories_per_100g)} kcal/100 g · P {food.protein_per_100g.toFixed(1)} · C{' '}
            {food.carbs_per_100g.toFixed(1)} · F {food.fat_per_100g.toFixed(1)} · Fibre{' '}
            {food.fibre_per_100g.toFixed(1)}
          </p>
          {measures.length > 0 && (
            <p className="m-0 mt-1 text-xs text-ink-muted">
              {measures.map((choice) => `${choice.label} (${formatNumber(choice.grams, 1)} g)`).join(' · ')}
            </p>
          )}
          {fromFatSecret && onSaveFromFatSecret && (
            <p className="m-0 mt-1 text-xs text-ink-muted">
              FatSecret result — save it to your foods to correct its values or add your own measures.
            </p>
          )}
          {!fromFatSecret && food.fatsecret_id && (
            <p className="m-0 mt-1 text-xs text-ink-muted">From FatSecret — edits are kept in your own catalogue.</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {fromFatSecret && onSaveFromFatSecret ? (
            <button
              type="button"
              disabled={savingDisabled}
              onClick={() => onSaveFromFatSecret(food)}
              className="min-h-11 rounded-lg border border-primary px-3 text-sm font-medium text-primary-dark disabled:opacity-50"
              aria-label={`Save ${food.name} to your foods and edit it`}
            >
              {savingFromFatSecret ? 'Saving…' : 'Save & edit'}
            </button>
          ) : null}
          {editable && (
            <button
              type="button"
              onClick={() => onEdit(food)}
              className="min-h-11 min-w-11 rounded-lg border border-line bg-transparent text-ink-light"
              aria-label={`Edit ${food.name}`}
            >
              ✏️
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="min-h-11 min-w-11 rounded-lg border border-line bg-transparent text-ink-light"
              aria-label={`Delete ${food.name}`}
            >
              🗑
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

interface MeasureDraft {
  key: number
  description: string
  grams: string
}

function num(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function FoodEditorModal({
  food,
  onClose,
  onSaved,
}: {
  food: Food | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(food?.name ?? '')
  const [brand, setBrand] = useState(food?.brand ?? '')
  const [calories, setCalories] = useState(food ? String(food.calories_per_100g) : '')
  const [protein, setProtein] = useState(food ? String(food.protein_per_100g) : '')
  const [carbs, setCarbs] = useState(food ? String(food.carbs_per_100g) : '')
  const [fat, setFat] = useState(food ? String(food.fat_per_100g) : '')
  const [fibre, setFibre] = useState(food ? String(food.fibre_per_100g) : '')
  const [servingName, setServingName] = useState(food?.serving_name ?? '')
  const [servingGrams, setServingGrams] = useState(food?.serving_grams ? String(food.serving_grams) : '')
  const [measures, setMeasures] = useState<MeasureDraft[]>(() => householdMeasures(food))
  const [error, setError] = useState<string | null>(null)
  const [nextKey, setNextKey] = useState(() => householdMeasures(food).length + 1)

  const importedMeasures = (food?.servings ?? []).filter((serving) => serving.fatsecret_serving_id)

  const save = useMutation({
    mutationFn: (input: FoodInput) => (food ? updateFood(food.id as number, input) : createFood(input)),
    onSuccess: () => {
      onSaved()
      onClose()
    },
  })

  const addMeasure = () => {
    setMeasures((current) => [...current, { key: nextKey, description: '', grams: '' }])
    setNextKey((key) => key + 1)
  }

  const updateMeasure = (key: number, patch: Partial<MeasureDraft>) => {
    setMeasures((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  const buildInput = (): FoodInput | string => {
    const trimmedName = name.trim()
    if (!trimmedName) return 'A food needs a name.'

    const calorieValue = num(calories)
    if (!Number.isFinite(calorieValue) || calorieValue < 0) return 'Enter calories per 100 g (0 or more).'

    const macros = [protein, carbs, fat, fibre].map((value) => (value.trim() === '' ? 0 : num(value)))
    if (macros.some((value) => !Number.isFinite(value) || value < 0)) {
      return 'Protein, carbs, fat and fibre must be 0 or more.'
    }

    const trimmedServingName = servingName.trim()
    const servingGramsValue = servingGrams.trim() === '' ? Number.NaN : num(servingGrams)
    if (trimmedServingName && !(servingGramsValue > 0)) {
      return 'The preferred serving needs a weight in grams greater than zero.'
    }
    if (!trimmedServingName && servingGramsValue > 0) {
      return 'Give the preferred serving a name, for example “1 bag”.'
    }

    const cleanedMeasures: FoodServingInput[] = []
    for (const row of measures) {
      const description = row.description.trim()
      if (!description && row.grams.trim() === '') continue
      if (!description) return 'Every named measure needs a name.'
      const grams = num(row.grams)
      if (!(grams > 0)) return `“${description}” needs a weight in grams greater than zero.`
      cleanedMeasures.push({ description, grams })
    }

    return {
      name: trimmedName,
      brand: brand.trim() || undefined,
      calories_per_100g: calorieValue,
      protein_per_100g: macros[0],
      carbs_per_100g: macros[1],
      fat_per_100g: macros[2],
      fibre_per_100g: macros[3],
      serving_name: trimmedServingName || undefined,
      serving_grams: trimmedServingName ? servingGramsValue : undefined,
      // FatSecret-provided measures are never sent: the API keeps them as-is.
      servings: cleanedMeasures,
    }
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const input = buildInput()
    if (typeof input === 'string') {
      setError(input)
      return
    }
    setError(null)
    save.mutate(input)
  }

  return (
    <Modal open title={food ? `Edit ${food.name}` : 'New food'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {food?.fatsecret_id && (
          <p className="m-0 rounded-xl bg-surface px-3 py-2 text-xs text-ink-light">
            Saved from FatSecret. Corrections and measures you add here are kept in your own catalogue and used
            everywhere this food is logged from now on.
          </p>
        )}

        <label className="flex flex-col gap-1 text-sm font-medium">
          Name *
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="min-h-11 rounded-xl border border-line bg-card px-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Brand (optional)
          <input
            value={brand}
            onChange={(event) => setBrand(event.target.value)}
            className="min-h-11 rounded-xl border border-line bg-card px-3 text-base"
          />
        </label>

        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-1 text-sm font-semibold">Per 100 g</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <NumberField label="Calories *" value={calories} onChange={setCalories} />
            <NumberField label="Protein" value={protein} onChange={setProtein} />
            <NumberField label="Carbs" value={carbs} onChange={setCarbs} />
            <NumberField label="Fat" value={fat} onChange={setFat} />
            <NumberField label="Fibre" value={fibre} onChange={setFibre} />
          </div>
        </fieldset>

        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-1 text-sm font-semibold">Preferred serving</legend>
          <p className="m-0 mb-2 text-xs text-ink-light">
            The measure Add/Edit starts on. Both parts are needed; leave both blank if the food has none.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm font-medium">
              Name
              <input
                value={servingName}
                onChange={(event) => setServingName(event.target.value)}
                placeholder="1 bag"
                className="min-h-11 rounded-xl border border-line bg-card px-3 text-base"
              />
            </label>
            <NumberField label="Grams" value={servingGrams} onChange={setServingGrams} />
          </div>
        </fieldset>

        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-1 text-sm font-semibold">Other named measures</legend>
          <p className="m-0 mb-2 text-xs text-ink-light">
            Real portions of this food, each with its weight in grams — “1 slice”, “1 scoop”, “half a tin”.
          </p>
          <div className="flex flex-col gap-2">
            {measures.map((row) => (
              <div key={row.key} className="flex flex-wrap items-end gap-2">
                <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm font-medium">
                  Name
                  <input
                    value={row.description}
                    onChange={(event) => updateMeasure(row.key, { description: event.target.value })}
                    placeholder="1 slice"
                    className="min-h-11 rounded-xl border border-line bg-card px-3 text-base"
                  />
                </label>
                <NumberField
                  label="Grams"
                  value={row.grams}
                  onChange={(value) => updateMeasure(row.key, { grams: value })}
                />
                <button
                  type="button"
                  onClick={() => setMeasures((current) => current.filter((item) => item.key !== row.key))}
                  className="min-h-11 rounded-xl border border-line px-3 text-sm text-ink-light"
                  aria-label={`Remove ${row.description || 'measure'}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addMeasure}
            className="mt-2 min-h-11 rounded-xl border border-primary px-4 text-sm font-semibold text-primary-dark"
          >
            + Add measure
          </button>
        </fieldset>

        {importedMeasures.length > 0 && (
          <div className="rounded-xl bg-surface p-3">
            <p className="m-0 text-xs font-semibold text-ink-light">From FatSecret (kept as-is)</p>
            <p className="m-0 mt-1 text-xs text-ink-light">
              {importedMeasures.map((serving) => `${serving.description} (${formatNumber(serving.grams, 1)} g)`).join(' · ')}
            </p>
          </div>
        )}

        {(error || save.isError) && (
          <p role="alert" className="m-0 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
            {error ?? (save.error as Error).message}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl border border-line bg-surface px-4 text-sm text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={save.isPending}
            className="min-h-11 rounded-xl bg-primary px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : food ? 'Save food' : 'Create food'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** The household's own measures, excluding anything FatSecret provided. */
function householdMeasures(food: Food | null): MeasureDraft[] {
  if (!food) return []
  return (food.servings ?? [])
    .filter((serving) => !serving.fatsecret_serving_id)
    // The preferred serving is edited in its own field, so keep it out of the list.
    .filter((serving) => serving.description !== food.serving_name || serving.grams !== food.serving_grams)
    .map((serving, index) => ({
      key: index,
      description: serving.description,
      grams: String(serving.grams),
    }))
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex w-28 flex-col gap-1 text-sm font-medium">
      {label}
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="0.1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 rounded-xl border border-line bg-card px-3 text-base tabular-nums"
      />
    </label>
  )
}
