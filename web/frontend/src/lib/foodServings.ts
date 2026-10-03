/**
 * Named gram-backed measures (owner decisions 29 and 30).
 *
 * A measure is only ever a real name for a real number of grams. Nothing here
 * invents a unit or a conversion: if a food has no usable measure, the quantity
 * UI offers grams and nothing else. The preferred serving
 * (`serving_name`/`serving_grams`) comes first, then any additional named
 * measures, with duplicates collapsed.
 */

import type { FoodServing } from '../api/types'

export interface FoodWithServings {
  serving_name?: string
  serving_grams?: number
  servings?: FoodServing[]
}

export interface ServingChoice {
  /** Stable key for selection and React lists. */
  key: string
  label: string
  grams: number
  /** FatSecret-provided measures are shown but cannot be removed in the editor. */
  fromFatSecret: boolean
}

export type QuantityMode = 'serving' | 'grams'

function usableGrams(grams: number | undefined): grams is number {
  return typeof grams === 'number' && Number.isFinite(grams) && grams > 0
}

/** The measures a food can honestly offer, preferred serving first. */
export function servingChoices(food: FoodWithServings): ServingChoice[] {
  const choices: ServingChoice[] = []
  const seen = new Set<string>()

  const add = (label: string | undefined, grams: number | undefined, fromFatSecret: boolean) => {
    if (!usableGrams(grams)) return
    const trimmed = (label ?? '').trim()
    // A measure without a name is shown as its weight — never as an invented unit.
    const description = trimmed || `${Math.round(grams * 10) / 10} g`
    const key = `${description.toLowerCase()}=${grams}`
    if (seen.has(key)) return
    seen.add(key)
    choices.push({ key, label: description, grams, fromFatSecret })
  }

  add(food.serving_name, food.serving_grams, false)
  for (const serving of food.servings ?? []) {
    add(serving.description, serving.grams, Boolean(serving.fatsecret_serving_id))
  }

  return choices
}

/** Owner decision 29: start in serving mode only when a real measure exists. */
export function preferredQuantityMode(food: FoodWithServings): QuantityMode {
  return servingChoices(food).length > 0 ? 'serving' : 'grams'
}

/**
 * The serving choice a picker should start on: the food's preferred measure,
 * or null when the food has none (so grams are used instead).
 */
export function defaultServing(food: FoodWithServings): ServingChoice | null {
  const choices = servingChoices(food)
  return choices.length > 0 ? choices[0] : null
}

/** The choice matching a gram value, within rounding tolerance. */
export function matchingServing(
  choices: ServingChoice[],
  grams: number,
): ServingChoice | null {
  if (!Number.isFinite(grams)) return null
  return choices.find((choice) => Math.abs(choice.grams - grams) < 0.5) ?? null
}
