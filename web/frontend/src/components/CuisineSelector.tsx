import { useId, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { MAX_RECIPE_CUISINE_LENGTH, SUGGESTED_RECIPE_CUISINES } from '../api/types'
import { cuisineOptions, cuisineValidationError } from '../lib/cuisine'
import { cuisineSlug } from '../lib/recipeTags'

/**
 * The recipe card's cuisine selector (issue #90, decision 123).
 *
 * Cuisine is one value per recipe, so the chips are single-select: tapping a
 * chip sets it, tapping the selected one clears it. The suggested cuisines come
 * first, then anything the household already uses, then “New…” for a cuisine
 * that exists in neither list — which is how “Peruvian” gets created.
 *
 * Nothing is saved here: this is a controlled input whose change lands with the
 * rest of the form (metadata on the recipe card, or the create payload).
 */
export function CuisineSelector({
  value,
  knownCuisines = [],
  disabled = false,
  onChange,
}: {
  /** The recipe's current cuisine; '' means none. */
  value: string
  /** Cuisines already in use elsewhere, offered as extra chips. */
  knownCuisines?: readonly string[]
  disabled?: boolean
  onChange: (cuisine: string) => void
}) {
  const [isAdding, setIsAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()

  const options = cuisineOptions(knownCuisines, value)
  const selectedSlug = cuisineSlug(value)

  /** Tapping the selected chip clears the cuisine; there is no separate control. */
  const choose = (name: string) => {
    const slug = cuisineSlug(name)
    onChange(slug && slug === selectedSlug ? '' : name.trim())
  }

  const openNew = () => {
    setDraft('')
    setError(null)
    setIsAdding(true)
  }

  const closeNew = () => {
    setIsAdding(false)
    setDraft('')
    setError(null)
  }

  const commitNew = () => {
    const message = cuisineValidationError(draft, MAX_RECIPE_CUISINE_LENGTH)
    if (message) {
      setError(message)
      return
    }
    onChange(draft.trim())
    closeNew()
  }

  const onDraftKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitNew()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closeNew()
    }
  }

  return (
    // No role of its own: the enclosing <fieldset> is the group, and its legend
    // supplies the accessible name (“Cuisine”) in both places this is used.
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {options.map((name) => {
          const selected = cuisineSlug(name) === selectedSlug
          return (
            <button
              key={cuisineSlug(name)}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-label={selected ? `Remove the ${name} cuisine` : `Set the cuisine to ${name}`}
              onClick={() => choose(name)}
              className={[
                'flex min-h-11 items-center rounded-full border px-4 text-sm font-medium disabled:opacity-50',
                selected
                  ? 'border-teal-700 bg-teal-700 text-white'
                  : 'border-line bg-surface text-ink',
              ].join(' ')}
            >
              {name}
            </button>
          )
        })}

        {isAdding ? (
          <div className="flex w-full flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={inputId}>
              New cuisine
            </label>
            <input
              id={inputId}
              autoFocus
              value={draft}
              disabled={disabled}
              maxLength={MAX_RECIPE_CUISINE_LENGTH + 20}
              onChange={(event) => {
                setDraft(event.target.value)
                setError(null)
              }}
              onKeyDown={onDraftKeyDown}
              placeholder="e.g. Peruvian"
              aria-label="New cuisine"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 text-base"
            />
            <button
              type="button"
              onClick={commitNew}
              disabled={disabled}
              className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              Add cuisine
            </button>
            <button
              type="button"
              onClick={closeNew}
              disabled={disabled}
              className="min-h-11 rounded-xl border border-line px-4 text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={openNew}
            aria-label="Add a cuisine that is not listed"
            className="flex min-h-11 items-center rounded-full border border-dashed border-primary px-4 text-sm font-semibold text-primary-dark disabled:opacity-50"
          >
            ＋ New…
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="m-0 text-sm text-danger">
          {error}
        </p>
      )}

      <p className="m-0 text-xs text-ink-light">
        {value.trim()
          ? 'Tap the cuisine again to remove it. Cuisines are shared with everyone who uses this recipe.'
          : `Suggested: ${SUGGESTED_RECIPE_CUISINES.join(', ')} — or add your own with “New…”.`}
      </p>
    </div>
  )
}
