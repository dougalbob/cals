import { Link } from 'react-router'
import type { Recipe } from '../api/types'
import { recipeTags, type RecipeTagRef } from '../lib/recipeTags'

type TaggableRecipe = Pick<Recipe, 'meal_occasions' | 'dish_type' | 'key_foods' | 'is_own_creation' | 'name'>

/**
 * The tag row that sits over the recipe photo (visual direction, decision 39).
 *
 * Tags are inert text unless the caller makes them actionable:
 * - `onTagClick` renders buttons — the Recipes catalogue uses this for
 *   tap-to-filter, with `selectedKeys` showing which tags are active.
 * - `tagHref` renders links — the recipe detail page uses this so a tag there
 *   opens the catalogue already filtered by it.
 *
 * The visible chip stays small so it does not crowd the photo, so the touch
 * target is widened with a transparent `::after` overlay rather than padding.
 */
export function RecipeTags({
  recipe,
  className = '',
  selectedKeys = [],
  onTagClick,
  tagHref,
}: {
  recipe: TaggableRecipe
  className?: string
  /** Tag keys currently filtering the list; selected tags are highlighted. */
  selectedKeys?: readonly string[]
  onTagClick?: (tag: RecipeTagRef) => void
  tagHref?: (tag: RecipeTagRef) => string
}) {
  const tags = recipeTags(recipe)

  if (tags.length === 0) return null

  return (
    <div
      role="group"
      aria-label={`${recipe.name} tags`}
      className={`flex flex-wrap gap-2 ${className}`}
    >
      {tags.map((tag) => {
        const selected = selectedKeys.includes(tag.key)
        const chipClass = tagChipClass(tag, selected)
        if (tagHref) {
          return (
            <Link
              key={tag.key}
              to={tagHref(tag)}
              aria-label={`Show recipes tagged ${tag.label}`}
              className={chipClass}
            >
              {tag.label}
            </Link>
          )
        }
        if (onTagClick) {
          return (
            <button
              key={tag.key}
              type="button"
              onClick={() => onTagClick(tag)}
              aria-pressed={selected}
              aria-label={
                selected ? `Stop filtering by ${tag.label}` : `Filter recipes by ${tag.label}`
              }
              className={chipClass}
            >
              {tag.label}
            </button>
          )
        }
        return (
          <span key={tag.key} className={chipClass}>
            {tag.label}
          </span>
        )
      })}
    </div>
  )
}

function tagChipClass(tag: RecipeTagRef, selected: boolean): string {
  const colors = tag.kind === 'origin'
    ? selected
      ? 'bg-orange-700 text-white ring-2 ring-white/80'
      : 'bg-orange-200 text-orange-950 hover:bg-orange-100'
    : selected
      ? 'bg-primary text-white ring-2 ring-white/80'
      : 'bg-white/90 text-ink hover:bg-white'

  return [
    'relative rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none shadow-sm',
    "after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']",
    colors,
  ].join(' ')
}
