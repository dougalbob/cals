import { describe, expect, it } from 'vitest'
import { caloriesPer100g, isValidQuantity, nutritionForGrams, scaleEntryToGrams } from './diary'

/** A logged entry, as saved at the time: 150 g of something at 165 kcal/100 g. */
const entry = {
  quantity_grams: 150,
  calories: 247.5,
  protein: 46.5,
  carbs: 0,
  fat: 5.4,
  fibre: 0,
}

describe('isValidQuantity', () => {
  it('accepts a positive weight and rejects zero, negatives and NaN', () => {
    expect(isValidQuantity(1)).toBe(true)
    expect(isValidQuantity(0.5)).toBe(true)
    expect(isValidQuantity(0)).toBe(false)
    expect(isValidQuantity(-10)).toBe(false)
    expect(isValidQuantity(Number.NaN)).toBe(false)
    expect(isValidQuantity(Number.POSITIVE_INFINITY)).toBe(false)
  })
})

describe('caloriesPer100g', () => {
  it("derives the per-100 g figure from the entry's own snapshot", () => {
    expect(caloriesPer100g(entry)).toBeCloseTo(165, 6)
  })

  it('returns null rather than dividing by a zero or missing weight', () => {
    expect(caloriesPer100g({ ...entry, quantity_grams: 0 })).toBeNull()
  })
})

describe('nutritionForGrams', () => {
  const food = {
    calories_per_100g: 447,
    protein_per_100g: 6,
    carbs_per_100g: 70,
    fat_per_100g: 16,
    fibre_per_100g: 4,
  }

  it('calculates and snapshots every nutrient without rounding', () => {
    expect(nutritionForGrams(food, 25)).toEqual({
      quantity_grams: 25,
      calories: 111.75,
      protein: 1.5,
      carbs: 17.5,
      fat: 4,
      fibre: 1,
    })
  })

  it('refuses zero, negative and non-finite quantities', () => {
    expect(nutritionForGrams(food, 0)).toBeNull()
    expect(nutritionForGrams(food, -25)).toBeNull()
    expect(nutritionForGrams(food, Number.NaN)).toBeNull()
  })
})

describe('scaleEntryToGrams', () => {
  it('doubles every saved nutrient when the weight doubles', () => {
    const update = scaleEntryToGrams(entry, 300)

    expect(update).not.toBeNull()
    expect(update?.quantity_grams).toBe(300)
    expect(update?.calories).toBeCloseTo(495, 6)
    expect(update?.protein).toBeCloseTo(93, 6)
    expect(update?.fat).toBeCloseTo(10.8, 6)
  })

  it('scales down proportionally, preserving the entry snapshot rather than a definition', () => {
    const update = scaleEntryToGrams(entry, 50)

    expect(update?.calories).toBeCloseTo(82.5, 6)
    // The ratio is exactly preserved: whatever the stored values were, the same
    // factor applies to all of them, so the entry's own composition is unchanged.
    expect((update?.protein ?? 0) / (update?.calories ?? 1)).toBeCloseTo(46.5 / 247.5, 9)
  })

  it('keeps full precision instead of rounding at the data layer', () => {
    const update = scaleEntryToGrams(entry, 33)

    expect(update?.calories).toBeCloseTo((247.5 * 33) / 150, 12)
    expect(Number.isInteger(update?.calories)).toBe(false)
  })

  it('returns null for zero, negative and non-finite weights so nothing is saved', () => {
    expect(scaleEntryToGrams(entry, 0)).toBeNull()
    expect(scaleEntryToGrams(entry, -25)).toBeNull()
    expect(scaleEntryToGrams(entry, Number.NaN)).toBeNull()
  })

  it('returns null when the stored entry has no usable weight', () => {
    expect(scaleEntryToGrams({ ...entry, quantity_grams: 0 }, 200)).toBeNull()
  })

  it('handles a drink-style zero-calorie entry without producing NaN', () => {
    const zero = { quantity_grams: 250, calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 }
    const update = scaleEntryToGrams(zero, 500)

    expect(update?.calories).toBe(0)
    expect(update?.quantity_grams).toBe(500)
  })
})
