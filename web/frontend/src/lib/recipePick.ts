/**
 * "Add a recipe to a Diary meal" intent (owner request, 2026-10-03).
 *
 * Tapping **🍽 Add recipe** on a Diary meal card used to open a one-line picker
 * in a modal, which duplicated a worse version of the Recipes tab. It now
 * hands over to the Recipes tab — where search, favourites, archived recipes
 * and the tag filters already live — and carries the two things the Diary knew
 * and the recipe box cannot guess: **which meal** and **which date**.
 *
 * The intent rides in the URL (`/recipes?add-to=dinner&on=2026-10-01`) rather
 * than in a store, because that is how this app keeps state everywhere else: it
 * survives a reload, browser Back, and a trip into a recipe's detail page and
 * back out. It is deliberately boring data — a meal id and an ISO date — so a
 * hand-edited or stale link can only ever be ignored, never corrupt anything:
 * `parseRecipePick` returns null unless both parts are well formed.
 */

import { MEALS, type Meal } from '../api/types'

export interface RecipePickIntent {
  /** The Diary meal slot the flow started from. */
  meal: Meal
  /** The diary date being logged to — today for a same-day flow. */
  date: string
}

const MEAL_IDS = MEALS.map((meal) => meal.id) as string[]
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Read `?add-to=&on=` back into an intent, or null when it is absent or malformed. */
export function parseRecipePick(
  params: URLSearchParams,
  today: string,
): RecipePickIntent | null {
  const meal = params.get('add-to')
  if (meal === null || !MEAL_IDS.includes(meal)) return null
  const raw = params.get('on')
  const date = raw !== null && ISO_DATE.test(raw) ? raw : today
  return { meal: meal as Meal, date }
}

/** Append an active intent to a path or href, keeping whatever query it already has. */
export function withRecipePick(href: string, intent: RecipePickIntent | null): string {
  if (intent === null) return href
  const extra = new URLSearchParams()
  extra.set('add-to', intent.meal)
  extra.set('on', intent.date)
  return `${href}${href.includes('?') ? '&' : '?'}${extra.toString()}`
}

/** The recipe box, armed for this meal and date — where the Diary's button goes. */
export function startRecipePickHref(meal: Meal, date: string): string {
  return withRecipePick('/recipes', { meal, date })
}

/** Where a finished pick lands: that date's diary, scrolled to the meal that asked. */
export function diaryHrefForPick(intent: RecipePickIntent): string {
  return `/diary/${intent.date}#${intent.meal}`
}

/** "Back to that day" link for a cancel, without the meal hash to scroll to. */
export function diaryHrefForDate(date: string): string {
  return `/diary/${date}`
}

export function mealLabel(meal: Meal): string {
  return MEALS.find((option) => option.id === meal)?.label ?? meal
}
