/**
 * The cuisine chip list for the recipe editor (issue #90, decision 123).
 *
 * Cuisines are free text on the server, so the editor's job is only to make the
 * common case one tap: the owner's suggested starters (Italian, Indian,
 * Chinese, Thai, Mexican, English, Korean) come first in that order, then
 * whatever the household has already used — including a cuisine the recipe
 * carries but which appears nowhere else.
 *
 * Two names that slug to the same key (“Thai” and “  thai ”) are one cuisine,
 * not two chips.
 */

import { SUGGESTED_RECIPE_CUISINES } from '../api/types'
import { cuisineSlug } from './recipeTags'

/**
 * The chip row: suggestions in the owner's order, then every other cuisine
 * alphabetically. `current` is included even when it is in neither list, so a
 * recipe's own cuisine is always visible (and therefore removable).
 */
export function cuisineOptions(
  knownCuisines: readonly string[],
  current?: string,
): string[] {
  const bySlug = new Map<string, string>()
  const add = (name: string | undefined) => {
    if (!name) return
    const trimmed = name.trim()
    const slug = cuisineSlug(trimmed)
    if (!slug || bySlug.has(slug)) return
    bySlug.set(slug, trimmed)
  }

  // Suggestions win the display spelling, then anything already in use.
  for (const suggestion of SUGGESTED_RECIPE_CUISINES) add(suggestion)
  for (const known of knownCuisines) add(known)
  add(current)

  const suggested = new Set(SUGGESTED_RECIPE_CUISINES.map((name) => cuisineSlug(name)))
  const suggestions: string[] = []
  const extras: string[] = []
  for (const [slug, name] of bySlug) {
    if (suggested.has(slug)) suggestions.push(name)
    else extras.push(name)
  }
  suggestions.sort(
    (a, b) =>
      SUGGESTED_RECIPE_CUISINES.indexOf(a as (typeof SUGGESTED_RECIPE_CUISINES)[number]) -
      SUGGESTED_RECIPE_CUISINES.indexOf(b as (typeof SUGGESTED_RECIPE_CUISINES)[number]),
  )
  extras.sort((a, b) => a.localeCompare(b))
  return [...suggestions, ...extras]
}

/** The validation message for a hand-typed cuisine, or null when it is usable. */
export function cuisineValidationError(
  value: string,
  maxLength: number,
): string | null {
  const trimmed = value.trim()
  if (!trimmed) return 'Type the cuisine you want to add.'
  if (trimmed.length > maxLength) return `Keep the cuisine to ${maxLength} characters or fewer.`
  if (!cuisineSlug(trimmed)) return 'Use at least one letter or number.'
  return null
}
