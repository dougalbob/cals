/**
 * Recipe tag identity, matching and URL state.
 *
 * A recipe's "tags" are its structured classification — meal occasions, dish
 * type, an optional household-origin marker, and known-Food key foods (product
 * decisions 34–35 and 79). They are rendered on
 * the recipe photo and, since the tap-to-filter increment, they are also the
 * filter controls: tapping a tag narrows the catalogue, tapping a second tag
 * narrows it further (every selected tag must be present, i.e. AND).
 *
 * Tags are identified by a stable key such as `food:11` rather than by their
 * display label, because labels come from shared data (a Food's name) that can
 * be edited while a filter link or the address bar is still open. Comma-joined
 * keys are what the Recipes route carries in `?tags=`, which keeps the filter
 * in the URL: it survives a reload, back navigation and a trip to a recipe
 * detail page.
 */

import {
  RECIPE_DISH_TYPES,
  RECIPE_MEAL_OCCASIONS,
  type Recipe,
  type RecipeDishType,
  type RecipeMealOccasion,
} from '../api/types'

export type RecipeTagKind = 'occasion' | 'dish' | 'origin' | 'food'

/** Stable URL key for the household-shared own-creation marker. */
export const OWN_CREATION_TAG_KEY = 'origin:own'

export interface RecipeTagRef {
  /** Stable identity used in `?tags=` and in comparisons: `occasion:lunch`, `dish:main`, `origin:own`, `food:11`. */
  key: string
  kind: RecipeTagKind
  /** What the chip shows. For key foods this is the Food's own name, never a hand-typed label. */
  label: string
  /** Only for `kind === 'food'`: the cals Food id behind the label. */
  foodId?: number
}

/** The recipe fields tags are derived from. */
type TaggableRecipe = Pick<Recipe, 'meal_occasions' | 'dish_type' | 'key_foods' | 'is_own_creation'>

const OCCASION_PREFIX = 'occasion:'
const DISH_PREFIX = 'dish:'
const ORIGIN_PREFIX = 'origin:'
const FOOD_PREFIX = 'food:'

export function occasionTagKey(occasion: RecipeMealOccasion): string {
  return `${OCCASION_PREFIX}${occasion}`
}

export function dishTagKey(dishType: RecipeDishType): string {
  return `${DISH_PREFIX}${dishType}`
}

export function foodTagKey(foodId: number): string {
  return `${FOOD_PREFIX}${foodId}`
}

export function occasionLabel(occasion: RecipeMealOccasion): string {
  return RECIPE_MEAL_OCCASIONS.find((item) => item.value === occasion)?.label ?? occasion
}

export function dishLabel(dishType: RecipeDishType): string {
  return RECIPE_DISH_TYPES.find((item) => item.value === dishType)?.label ?? dishType
}

/** A recipe's tags, in display order: occasions, dish type, origin marker, key foods. */
export function recipeTags(recipe: TaggableRecipe): RecipeTagRef[] {
  const tags: RecipeTagRef[] = recipe.meal_occasions.map((occasion) => ({
    key: occasionTagKey(occasion),
    kind: 'occasion' as const,
    label: occasionLabel(occasion),
  }))
  if (recipe.dish_type) {
    tags.push({
      key: dishTagKey(recipe.dish_type),
      kind: 'dish',
      label: dishLabel(recipe.dish_type),
    })
  }
  if (recipe.is_own_creation) {
    tags.push({
      key: OWN_CREATION_TAG_KEY,
      kind: 'origin',
      label: 'Own creation',
    })
  }
  for (const food of recipe.key_foods) {
    tags.push({
      key: foodTagKey(food.food_id),
      kind: 'food',
      label: food.food_name,
      foodId: food.food_id,
    })
  }
  return tags
}

/**
 * True when a recipe carries every selected tag.
 *
 * AND (not OR) is deliberate: it is what makes "Chicken, then Mushroom" show
 * only the recipes with both, which is the flow the owner asked for.
 */
export function matchesTags(recipe: TaggableRecipe, selectedKeys: readonly string[]): boolean {
  if (selectedKeys.length === 0) return true
  const keys = new Set(recipeTags(recipe).map((tag) => tag.key))
  return selectedKeys.every((key) => keys.has(key))
}

function isKnownTagKey(key: string): boolean {
  if (key.startsWith(OCCASION_PREFIX)) {
    const value = key.slice(OCCASION_PREFIX.length)
    return RECIPE_MEAL_OCCASIONS.some((item) => item.value === value)
  }
  if (key.startsWith(DISH_PREFIX)) {
    const value = key.slice(DISH_PREFIX.length)
    return RECIPE_DISH_TYPES.some((item) => item.value === value)
  }
  if (key.startsWith(ORIGIN_PREFIX)) {
    return key === OWN_CREATION_TAG_KEY
  }
  if (key.startsWith(FOOD_PREFIX)) {
    return /^\d+$/.test(key.slice(FOOD_PREFIX.length))
  }
  return false
}

/**
 * Read `?tags=` back into a selection. Unknown or duplicated keys are dropped so
 * a hand-edited or stale URL cannot silently filter the catalogue down to zero.
 */
export function parseTagParam(raw: string | null | undefined): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  const keys: string[] = []
  for (const part of raw.split(',')) {
    const key = part.trim()
    if (!isKnownTagKey(key) || seen.has(key)) continue
    seen.add(key)
    keys.push(key)
  }
  return keys
}

export function serialiseTagParam(keys: readonly string[]): string {
  return keys.join(',')
}

/** Add a tag to the filter, or remove it when it is already selected. */
export function toggleTag(selectedKeys: readonly string[], key: string): string[] {
  return selectedKeys.includes(key) ? selectedKeys.filter((item) => item !== key) : [...selectedKeys, key]
}

export function selectedTagKeys(selectedKeys: readonly string[], kind: RecipeTagKind): string[] {
  return selectedKeys.filter((key) => key.startsWith(`${kind}:`))
}

/** The facet value inside a tag key: `dish:main` → `main`, `origin:own` → `own`, `food:11` → `11`. */
export function tagValue(key: string): string {
  const separator = key.indexOf(':')
  return separator === -1 ? key : key.slice(separator + 1)
}

/**
 * A label for a selected tag. Food tags are resolved from the loaded catalogue
 * (their Food name); the fallback keeps a stale key removable rather than
 * leaving an unlabelled, undeletable filter on screen.
 */
export function tagLabel(key: string, catalogue: readonly TaggableRecipe[] = []): string {
  if (key.startsWith(OCCASION_PREFIX)) {
    const value = key.slice(OCCASION_PREFIX.length)
    return RECIPE_MEAL_OCCASIONS.find((item) => item.value === value)?.label ?? value
  }
  if (key.startsWith(DISH_PREFIX)) {
    const value = key.slice(DISH_PREFIX.length)
    return RECIPE_DISH_TYPES.find((item) => item.value === value)?.label ?? value
  }
  if (key === OWN_CREATION_TAG_KEY) return 'Own creation'
  if (key.startsWith(FOOD_PREFIX)) {
    const foodId = key.slice(FOOD_PREFIX.length)
    for (const recipe of catalogue) {
      const food = recipe.key_foods.find((candidate) => String(candidate.food_id) === foodId)
      if (food) return food.food_name
    }
    return `Food #${foodId}`
  }
  return key
}

/** `?tags=…` for the current selection, or an empty string when nothing is selected. */
export function tagQuerySuffix(selectedKeys: readonly string[]): string {
  const tags = serialiseTagParam(selectedKeys)
  return tags ? `?tags=${encodeURIComponent(tags)}` : ''
}

/** The catalogue route with a selection applied, used for links between screens. */
export function recipesHref(selectedKeys: readonly string[]): string {
  return `/recipes${tagQuerySuffix(selectedKeys)}`
}
