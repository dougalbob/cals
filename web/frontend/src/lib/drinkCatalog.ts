import type { Drink } from '../api/types'

/** Milk/sugar extras use household medians, not a beverage database (decision 24). */
export const MILK_KCAL = 15
export const SUGAR_TSP_KCAL = 16

export type SugarAmount = '0' | '1' | '2' | 'sweetener'

export interface DrinkType {
  id: string
  name: string
  icon: string
  volume_ml: number
  base_calories: number
  accepts_milk: boolean
  accepts_sugar: boolean
  counts_toward_water: boolean
}

/**
 * Catalog order is load-bearing: the everyday four must be on screen without
 * scrolling on a phone (decision 25).
 */
export const DRINK_CATALOG: DrinkType[] = [
  { id: 'coffee', name: 'Coffee', icon: '☕', volume_ml: 250, base_calories: 2, accepts_milk: true, accepts_sugar: true, counts_toward_water: true },
  { id: 'tea', name: 'Tea', icon: '🫖', volume_ml: 250, base_calories: 2, accepts_milk: true, accepts_sugar: true, counts_toward_water: true },
  { id: 'milk', name: 'Milk', icon: '🥛', volume_ml: 200, base_calories: 100, accepts_milk: false, accepts_sugar: false, counts_toward_water: false },
  { id: 'juice', name: 'Juice', icon: '🧃', volume_ml: 200, base_calories: 90, accepts_milk: false, accepts_sugar: false, counts_toward_water: false },
  { id: 'cappuccino', name: 'Cappuccino', icon: '☕', volume_ml: 240, base_calories: 80, accepts_milk: false, accepts_sugar: true, counts_toward_water: false },
  { id: 'latte', name: 'Latte', icon: '☕', volume_ml: 240, base_calories: 120, accepts_milk: false, accepts_sugar: true, counts_toward_water: false },
  { id: 'hot-chocolate', name: 'Hot chocolate', icon: '🍫', volume_ml: 250, base_calories: 150, accepts_milk: false, accepts_sugar: true, counts_toward_water: false },
  { id: 'squash', name: 'Squash', icon: '🥤', volume_ml: 250, base_calories: 20, accepts_milk: false, accepts_sugar: false, counts_toward_water: true },
  { id: 'soft-drink', name: 'Soft drink', icon: '🥤', volume_ml: 330, base_calories: 140, accepts_milk: false, accepts_sugar: false, counts_toward_water: false },
  { id: 'beer', name: 'Beer', icon: '🍺', volume_ml: 330, base_calories: 140, accepts_milk: false, accepts_sugar: false, counts_toward_water: false },
  { id: 'wine', name: 'Wine', icon: '🍷', volume_ml: 175, base_calories: 160, accepts_milk: false, accepts_sugar: false, counts_toward_water: false },
]

const NAME_ALIASES: Record<string, string> = {
  'black coffee': 'coffee',
  'white coffee': 'coffee',
  lager: 'beer',
  'orange juice': 'juice',
  cocoa: 'hot-chocolate',
  'hot chocolate': 'hot-chocolate',
  'soft dink': 'soft-drink',
  soda: 'soft-drink',
  cola: 'soft-drink',
}

export function isWaterDrink(drink: { name: string }): boolean {
  return drink.name.trim().toLowerCase() === 'water'
}

export function extrasCalories(milk: boolean, sugar: SugarAmount): number {
  const milkKcal = milk ? MILK_KCAL : 0
  const sugarKcal = sugar === '1' || sugar === '2' ? Number(sugar) * SUGAR_TSP_KCAL : 0
  return milkKcal + sugarKcal
}

export function usualCalories(type: DrinkType, milk: boolean, sugar: SugarAmount): number {
  const milkKcal = type.accepts_milk ? extrasCalories(milk, '0') : 0
  const sugarKcal = type.accepts_sugar ? extrasCalories(false, sugar) : 0
  return type.base_calories + milkKcal + sugarKcal
}

export function defaultUsual(type: DrinkType): { milk: boolean; sugar: SugarAmount } {
  if (type.id === 'tea') return { milk: true, sugar: '0' }
  return { milk: false, sugar: '0' }
}

export function catalogTypeForName(name: string): DrinkType | undefined {
  const key = name.trim().toLowerCase()
  const aliased = NAME_ALIASES[key] ?? key
  return DRINK_CATALOG.find((type) => type.id === aliased || type.name.toLowerCase() === aliased)
}

export function drinkExtras(drink: Drink): {
  acceptsMilk: boolean
  acceptsSugar: boolean
  usualMilk: boolean
  usualSugar: SugarAmount
} {
  const fromCatalog = catalogTypeForName(drink.name)
  // The extras columns arrived after the first drinks existed, and the additive
  // migration defaulted every legacy row to "accepts nothing" — which made the
  // ⋯ vary-this-time button disappear from Tea and Coffee. The drink's type is
  // the fallback: a Tea row that has never been configured still accepts milk
  // and sugar, exactly as the catalog says. A row that has been configured
  // keeps whatever it says on top of that.
  return {
    acceptsMilk: Boolean(drink.accepts_milk) || Boolean(fromCatalog?.accepts_milk),
    acceptsSugar: Boolean(drink.accepts_sugar) || Boolean(fromCatalog?.accepts_sugar),
    usualMilk: drink.usual_milk ?? (fromCatalog ? defaultUsual(fromCatalog).milk : false),
    usualSugar: normalizeSugar(drink.usual_sugar),
  }
}

export function normalizeSugar(value: string | undefined | null): SugarAmount {
  if (value === '1' || value === '2' || value === 'sweetener') return value
  return '0'
}

/**
 * Calories for a one-off log that differs from the drink's usual extras.
 * `drink.calories` is "my usual"; we swap the extra portion.
 */
export function varyCalories(drink: Drink, milk: boolean, sugar: SugarAmount): number {
  const extras = drinkExtras(drink)
  const usual = extrasCalories(extras.acceptsMilk && extras.usualMilk, extras.acceptsSugar ? extras.usualSugar : '0')
  const next = extrasCalories(extras.acceptsMilk && milk, extras.acceptsSugar ? sugar : '0')
  return Math.max(0, drink.calories - usual + next)
}

export function sugarLabel(sugar: SugarAmount): string {
  if (sugar === 'sweetener') return 'Sweetener'
  if (sugar === '0') return 'No sugar'
  return sugar === '1' ? '1 sugar' : '2 sugars'
}

export function chunkRows<T>(items: T[], size: number): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size))
  return rows
}
