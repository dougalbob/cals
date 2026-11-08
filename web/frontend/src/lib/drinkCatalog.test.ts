import { describe, expect, it } from 'vitest'
import {
  DRINK_CATALOG,
  catalogTypeForName,
  drinkExtras,
  extrasCalories,
  usualCalories,
  varyCalories,
  isWaterDrink,
  defaultUsual,
  chunkRows,
} from './drinkCatalog'
import type { Drink } from '../api/types'

describe('drink catalog', () => {
  it('puts coffee, tea, milk and juice first so they are on screen without scrolling', () => {
    expect(DRINK_CATALOG.slice(0, 4).map((type) => type.id)).toEqual(['coffee', 'tea', 'milk', 'juice'])
  })

  it('treats only a drink named Water as the glass drink', () => {
    expect(isWaterDrink({ name: 'Water' })).toBe(true)
    expect(isWaterDrink({ name: ' tea ' })).toBe(false)
  })

  it('adds household-median extras', () => {
    expect(extrasCalories(false, '0')).toBe(0)
    expect(extrasCalories(true, '0')).toBe(15)
    expect(extrasCalories(true, '1')).toBe(31)
    expect(extrasCalories(false, '2')).toBe(32)
    expect(extrasCalories(true, 'sweetener')).toBe(15)
  })

  it('bakes usual extras into catalog calories', () => {
    const tea = catalogTypeForName('Tea')!
    const usual = defaultUsual(tea)
    expect(usual.milk).toBe(true)
    expect(usualCalories(tea, usual.milk, usual.sugar)).toBe(2 + 15)
  })

  it('swaps extras on a vary-this-time log without changing the usual', () => {
    const drink: Drink = {
      id: 1,
      user_id: 1,
      name: 'Tea',
      icon: '🫖',
      volume_ml: 250,
      calories: 17,
      counts_toward_water: true,
      accepts_milk: true,
      accepts_sugar: true,
      usual_milk: true,
      usual_sugar: '0',
    }
    expect(varyCalories(drink, true, '0')).toBe(17)
    expect(varyCalories(drink, false, '0')).toBe(2)
    expect(varyCalories(drink, true, '1')).toBe(33)
  })

  it('falls back to the type for a legacy row whose extras flags were never set', () => {
    // The additive migration defaulted accepts_milk/accepts_sugar to 0 on rows
    // that predate them; the drink's type still decides what it can take.
    const legacyTea: Drink = {
      id: 1,
      user_id: 1,
      name: 'Tea',
      icon: '🫖',
      volume_ml: 250,
      calories: 2,
      counts_toward_water: true,
      accepts_milk: false,
      accepts_sugar: false,
      usual_milk: false,
      usual_sugar: '0',
    }
    expect(drinkExtras(legacyTea)).toMatchObject({ acceptsMilk: true, acceptsSugar: true })

    // A row that has been configured keeps what it says.
    expect(drinkExtras({ ...legacyTea, accepts_sugar: false, accepts_milk: true })).toMatchObject({
      acceptsMilk: true,
      acceptsSugar: true,
    })

    // A type that takes neither stays button-free.
    const juice: Drink = { ...legacyTea, name: 'Juice' }
    expect(drinkExtras(juice)).toMatchObject({ acceptsMilk: false, acceptsSugar: false })
  })

  it('resolves common aliases onto catalog types', () => {
    expect(catalogTypeForName('Black Coffee')?.id).toBe('coffee')
    expect(catalogTypeForName('Lager')?.id).toBe('beer')
    expect(catalogTypeForName('Orange juice')?.id).toBe('juice')
  })

  it('chunks the 2×2 rows', () => {
    expect(chunkRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
})
