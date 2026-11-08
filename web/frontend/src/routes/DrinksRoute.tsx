import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../api/client'
import { createDrink, deleteDrink, updateDrink } from '../api/diary'
import type { Drink, DrinkInput, SugarAmount } from '../api/types'
import { Modal } from '../components/Modal'
import { pickWaterDrink } from '../components/FluidsCard'
import { useDrinkDefinitions } from '../hooks/useDiaryData'
import {
  DRINK_CATALOG,
  catalogTypeForName,
  defaultUsual,
  drinkExtras,
  isWaterDrink,
  sugarLabel,
  usualCalories,
  type DrinkType,
} from '../lib/drinkCatalog'
import { formatNumber } from '../lib/format'

const GLASS_PRESETS = [200, 250, 330, 500]

/**
 * My drinks — a profile, not a setting. Pick types from the catalog, tweak
 * usuals, set glass size. The Today 2×2 reads this list.
 */
export function DrinksRoute() {
  const queryClient = useQueryClient()
  const definitions = useDrinkDefinitions()
  const drinks = definitions.data ?? []
  const water = pickWaterDrink(drinks)
  const selected = drinks.filter((drink) => !isWaterDrink(drink))

  const [editing, setEditing] = useState<Drink | null>(null)
  const [error, setError] = useState<string | null>(null)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.drinkDefinitions })
  }

  const create = useMutation({
    mutationFn: createDrink,
    onSuccess: invalidate,
    onError: (err) => setError((err as Error).message),
  })
  const update = useMutation({
    mutationFn: ({ id, input }: { id: number; input: DrinkInput }) => updateDrink(id, input),
    onSuccess: invalidate,
    onError: (err) => setError((err as Error).message),
  })
  const remove = useMutation({
    mutationFn: deleteDrink,
    onSuccess: () => {
      setEditing(null)
      invalidate()
    },
    onError: (err) => setError((err as Error).message),
  })

  const nextSortOrder = useMemo(() => {
    const orders = selected.map((d) => d.sort_order ?? 0)
    return (orders.length ? Math.max(...orders) : 0) + 1
  }, [selected])

  const saveGlass = (volumeMl: number) => {
    if (volumeMl <= 0) return
    setError(null)
    if (water) {
      update.mutate({
        id: water.id,
        input: {
          name: 'Water',
          icon: water.icon || '💧',
          volume_ml: volumeMl,
          calories: 0,
          counts_toward_water: true,
          accepts_milk: false,
          accepts_sugar: false,
          usual_milk: false,
          usual_sugar: '0',
          sort_order: 0,
        },
      })
      return
    }
    create.mutate({
      name: 'Water',
      icon: '💧',
      volume_ml: volumeMl,
      calories: 0,
      counts_toward_water: true,
      accepts_milk: false,
      accepts_sugar: false,
      usual_milk: false,
      usual_sugar: '0',
      sort_order: 0,
    })
  }

  const addFromCatalog = (type: DrinkType) => {
    const existing = selected.find((drink) => drink.name.trim().toLowerCase() === type.name.toLowerCase())
    if (existing) {
      setEditing(existing)
      return
    }
    const usual = defaultUsual(type)
    setError(null)
    create.mutate(
      {
        name: type.name,
        icon: type.icon,
        volume_ml: type.volume_ml,
        calories: usualCalories(type, usual.milk, usual.sugar),
        counts_toward_water: type.counts_toward_water,
        accepts_milk: type.accepts_milk,
        accepts_sugar: type.accepts_sugar,
        usual_milk: usual.milk,
        usual_sugar: usual.sugar,
        sort_order: nextSortOrder,
      },
      {
        onSuccess: (created) => setEditing(created),
      },
    )
  }

  const busy = create.isPending || update.isPending || remove.isPending

  if (definitions.isPending) {
    return <p className="text-ink-light">Loading your drinks…</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p className="m-0 text-xs uppercase tracking-wide text-ink-light">Profile</p>
          <h2 className="m-0 text-lg font-semibold">My drinks</h2>
        </div>
        <Link to="/" className="text-sm font-medium text-primary-dark no-underline hover:underline">
          Back to Today
        </Link>
      </header>

      {error && (
        <p role="alert" className="m-0 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <section className="rounded-2xl bg-card p-4 shadow-card">
        <h3 className="m-0 text-base font-semibold">💧 Glass size</h3>
        <p className="m-0 mt-1 text-xs text-ink-light">
          One tap on Today logs this volume. The number inside the glass is your separate daily target.
          Water is not a tile in the 2×2.
        </p>
        <GlassSize water={water} disabled={busy} onSave={saveGlass} />
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-card">
        <h3 className="m-0 text-base font-semibold">On Today</h3>
        <p className="m-0 mt-1 text-xs text-ink-light">
          These fill the 2×2. More than four scroll. Tap to tweak your usual.
        </p>
        {selected.length === 0 ? (
          <p className="m-0 mt-3 text-sm text-ink-muted">Pick from the catalog below.</p>
        ) : (
          <ul className="list-none m-0 mt-3 p-0 flex flex-col gap-2">
            {selected.map((drink) => {
              const extras = drinkExtras(drink)
              return (
                <li key={drink.id}>
                  <button
                    type="button"
                    onClick={() => setEditing(drink)}
                    className="w-full flex items-center gap-3 min-h-12 rounded-xl border border-line bg-surface px-3 py-2 text-left cursor-pointer hover:border-primary-light"
                  >
                    <span aria-hidden className="text-xl leading-none">
                      {drink.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate">{drink.name}</span>
                      <span className="block text-[0.7rem] text-ink-light tabular-nums">
                        {drink.volume_ml} ml · {formatNumber(drink.calories)} kcal
                        {extras.acceptsMilk ? ` · ${extras.usualMilk ? 'milk' : 'no milk'}` : ''}
                        {extras.acceptsSugar ? ` · ${sugarLabel(extras.usualSugar).toLowerCase()}` : ''}
                      </span>
                    </span>
                    <span className="text-xs text-primary-dark">Edit</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-card">
        <h3 className="m-0 text-base font-semibold">Add a drink</h3>
        <p className="m-0 mt-1 text-xs text-ink-light">
          Coffee, tea, milk and juice sit at the top so they’re on screen without scrolling.
        </p>
        <ul className="list-none m-0 mt-3 p-0 grid grid-cols-4 gap-2">
          {DRINK_CATALOG.map((type) => {
            const isSelected = selected.some(
              (drink) => drink.name.trim().toLowerCase() === type.name.toLowerCase(),
            )
            return (
              <li key={type.id}>
                <button
                  type="button"
                  onClick={() => addFromCatalog(type)}
                  disabled={busy}
                  aria-pressed={isSelected}
                  className={[
                    'w-full flex flex-col items-center justify-center gap-1 min-h-[4.6rem] rounded-xl border px-1 py-2 cursor-pointer disabled:opacity-50',
                    isSelected ? 'border-primary bg-primary/10' : 'border-line bg-surface',
                  ].join(' ')}
                >
                  <span aria-hidden className="text-xl leading-none">
                    {type.icon}
                  </span>
                  <span className="text-[0.65rem] font-medium text-center leading-tight">{type.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      {editing && (
        <TweakDrinkModal
          key={editing.id}
          drink={editing}
          onClose={() => setEditing(null)}
          onSave={(input) => {
            update.mutate(
              { id: editing.id, input },
              {
                onSuccess: () => setEditing(null),
              },
            )
          }}
          onRemove={() => remove.mutate(editing.id)}
          pending={busy}
        />
      )}
    </div>
  )
}

function GlassSize({
  water,
  disabled,
  onSave,
}: {
  water: Drink | null
  disabled: boolean
  onSave: (volumeMl: number) => void
}) {
  const ml = water?.volume_ml ?? 250

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || ml <= 50}
          onClick={() => onSave(Math.max(50, ml - 50))}
          className="min-h-11 min-w-11 rounded-xl border border-line bg-surface text-lg cursor-pointer disabled:opacity-40"
          aria-label="Decrease glass size"
        >
          −
        </button>
        <p className="m-0 flex-1 text-center">
          <span className="text-2xl font-semibold tabular-nums">{ml}</span>
          <span className="text-sm text-ink-light"> ml</span>
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSave(ml + 50)}
          className="min-h-11 min-w-11 rounded-xl border border-line bg-surface text-lg cursor-pointer disabled:opacity-40"
          aria-label="Increase glass size"
        >
          +
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {GLASS_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={disabled}
            onClick={() => onSave(preset)}
            aria-pressed={ml === preset}
            className={[
              'min-h-10 rounded-xl border text-xs font-medium tabular-nums cursor-pointer disabled:opacity-40',
              ml === preset ? 'bg-primary text-white border-primary' : 'bg-surface text-ink border-line',
            ].join(' ')}
          >
            {preset}
          </button>
        ))}
      </div>
    </div>
  )
}

function TweakDrinkModal({
  drink,
  onClose,
  onSave,
  onRemove,
  pending,
}: {
  drink: Drink
  onClose: () => void
  onSave: (input: DrinkInput) => void
  onRemove: () => void
  pending: boolean
}) {
  const type = catalogTypeForName(drink.name)
  const extras = drinkExtras(drink)
  // Held as text, not numbers: a controlled `type="number"` fed `Number('')`
  // renders a literal 0 the moment the field is cleared, so the next keystroke
  // produced "0250". Text state keeps the field empty while it is being
  // retyped, exactly as the food editor does.
  const [volumeText, setVolumeText] = useState(String(drink.volume_ml))
  const [caloriesText, setCaloriesText] = useState(String(drink.calories))
  const [milk, setMilk] = useState(extras.usualMilk)
  const [sugar, setSugar] = useState<SugarAmount>(extras.usualSugar)
  const [waterFlag, setWaterFlag] = useState(drink.counts_toward_water)
  const [caloriesTouched, setCaloriesTouched] = useState(false)

  const volume = volumeText.trim() === '' ? Number.NaN : Number(volumeText)
  const calories = caloriesText.trim() === '' ? Number.NaN : Number(caloriesText)
  const acceptsMilk = extras.acceptsMilk
  const acceptsSugar = extras.acceptsSugar

  const applyUsual = (nextMilk: boolean, nextSugar: SugarAmount) => {
    setMilk(nextMilk)
    setSugar(nextSugar)
    if (!caloriesTouched && type) {
      setCaloriesText(String(usualCalories(type, nextMilk, nextSugar)))
    }
  }

  return (
    <Modal open title={`Your ${drink.name.toLowerCase()}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-light">
          Typical volume (ml)
          <input
            type="number"
            min={1}
            value={volumeText}
            onChange={(e) => setVolumeText(e.target.value)}
            className="min-h-11 rounded-xl border border-line px-3 text-sm tabular-nums text-ink"
          />
        </label>

        {acceptsMilk && (
          <fieldset className="m-0 p-0 border-0">
            <legend className="text-xs font-semibold text-ink-light mb-1.5">Usual milk</legend>
            <div className="grid grid-cols-2 gap-2">
              <Choice selected={!milk} onClick={() => applyUsual(false, sugar)} label="None" />
              <Choice selected={milk} onClick={() => applyUsual(true, sugar)} label="With milk" />
            </div>
          </fieldset>
        )}

        {acceptsSugar && (
          <fieldset className="m-0 p-0 border-0">
            <legend className="text-xs font-semibold text-ink-light mb-1.5">Usual sugar</legend>
            <div className="grid grid-cols-4 gap-2">
              {(['0', '1', '2', 'sweetener'] as SugarAmount[]).map((value) => (
                <Choice
                  key={value}
                  selected={sugar === value}
                  onClick={() => applyUsual(milk, value)}
                  label={value === 'sweetener' ? 'Sweet' : value}
                />
              ))}
            </div>
          </fieldset>
        )}

        <label className="flex flex-col gap-1 text-xs font-medium text-ink-light">
          Calories (your usual)
          <input
            type="number"
            min={0}
            value={caloriesText}
            onChange={(e) => {
              setCaloriesTouched(true)
              setCaloriesText(e.target.value)
            }}
            className="min-h-11 rounded-xl border border-line px-3 text-sm tabular-nums text-ink"
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={waterFlag}
            onChange={(e) => setWaterFlag(e.target.checked)}
          />
          Counts towards the water target
        </label>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onRemove}
            className="min-h-11 px-3 rounded-xl border border-danger/40 text-danger text-sm bg-transparent cursor-pointer disabled:opacity-50"
          >
            Remove
          </button>
          <button
            type="button"
            disabled={pending || !(volume > 0) || !(calories >= 0)}
            onClick={() =>
              onSave({
                name: drink.name,
                icon: drink.icon,
                volume_ml: volume,
                calories,
                counts_toward_water: waterFlag,
                accepts_milk: acceptsMilk,
                accepts_sugar: acceptsSugar,
                usual_milk: milk,
                usual_sugar: sugar,
                sort_order: drink.sort_order ?? 0,
              })
            }
            className="min-h-11 px-4 rounded-xl bg-primary text-white text-sm font-medium border-0 cursor-pointer disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Choice({
  selected,
  onClick,
  label,
}: {
  selected: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        'min-h-11 rounded-xl border text-sm font-medium cursor-pointer',
        selected ? 'bg-primary text-white border-primary' : 'bg-surface text-ink border-line',
      ].join(' ')}
    >
      {label}
    </button>
  )
}
