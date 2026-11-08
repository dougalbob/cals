import { describe, expect, it } from 'vitest'
import { ratingList, recipeRatings } from './recipeRatings'

/** A well-formed recipe shape every case starts from. */
function ratedRecipe(overrides: Partial<Parameters<typeof recipeRatings>[0]> = {}) {
  return recipeRatings({
    total_weight_grams: 1050,
    total_calories: 1710.6,
    fat_per_100g: 3.7,
    carbs_per_100g: 12.1,
    fibre_per_100g: 0.6,
    ...overrides,
  })
}

/** The same recipe, asserting it is rateable, for band-edge checks. */
function mustRate(overrides: Partial<Parameters<typeof recipeRatings>[0]> = {}) {
  const ratings = ratedRecipe(overrides)
  if (!ratings) throw new Error('expected a rating')
  return ratings
}

describe('recipeRatings (issue #97, decision 126)', () => {
  it('scores a real recipe on all four guides', () => {
    const ratings = ratedRecipe()
    expect(ratings).not.toBeNull()
    expect(ratings?.fat.score).toBe(4) // 3.7 g/100 g — low fat
    expect(ratings?.fibre.score).toBe(1) // 0.6 g/100 g — low fibre
    expect(ratings?.carbs.score).toBe(3) // 12.1 g/100 g — moderate carbs
    expect(ratings?.volume.score).toBe(2) // 0.61 g/kcal — low volume
    expect(ratings?.overall).toBe(2.5)
  })

  it('keeps the four guides in display order', () => {
    const ratings = ratedRecipe()
    expect(ratingList(ratings!).map((rating) => rating.key)).toEqual([
      'fat',
      'fibre',
      'carbs',
      'volume',
    ])
  })

  it('scores fat density against the band edges (lower is better)', () => {
    expect(mustRate({ fat_per_100g: 3 }).fat.score).toBe(5)
    expect(mustRate({ fat_per_100g: 3.1 }).fat.score).toBe(4)
    expect(mustRate({ fat_per_100g: 6 }).fat.score).toBe(4)
    expect(mustRate({ fat_per_100g: 6.1 }).fat.score).toBe(3)
    expect(mustRate({ fat_per_100g: 10 }).fat.score).toBe(3)
    expect(mustRate({ fat_per_100g: 10.1 }).fat.score).toBe(2)
    expect(mustRate({ fat_per_100g: 15 }).fat.score).toBe(2)
    expect(mustRate({ fat_per_100g: 15.1 }).fat.score).toBe(1)
  })

  it('scores fibre against the band edges (higher is better)', () => {
    expect(mustRate({ fibre_per_100g: 6 }).fibre.score).toBe(5)
    expect(mustRate({ fibre_per_100g: 5.9 }).fibre.score).toBe(4)
    expect(mustRate({ fibre_per_100g: 4.5 }).fibre.score).toBe(4)
    expect(mustRate({ fibre_per_100g: 4.4 }).fibre.score).toBe(3)
    expect(mustRate({ fibre_per_100g: 3 }).fibre.score).toBe(3)
    expect(mustRate({ fibre_per_100g: 2.9 }).fibre.score).toBe(2)
    expect(mustRate({ fibre_per_100g: 1.5 }).fibre.score).toBe(2)
    expect(mustRate({ fibre_per_100g: 1.4 }).fibre.score).toBe(1)
  })

  it('scores carb density against the band edges (lower is better)', () => {
    expect(mustRate({ carbs_per_100g: 5 }).carbs.score).toBe(5)
    expect(mustRate({ carbs_per_100g: 5.1 }).carbs.score).toBe(4)
    expect(mustRate({ carbs_per_100g: 10 }).carbs.score).toBe(4)
    expect(mustRate({ carbs_per_100g: 10.1 }).carbs.score).toBe(3)
    expect(mustRate({ carbs_per_100g: 20 }).carbs.score).toBe(3)
    expect(mustRate({ carbs_per_100g: 20.1 }).carbs.score).toBe(2)
    expect(mustRate({ carbs_per_100g: 30 }).carbs.score).toBe(2)
    expect(mustRate({ carbs_per_100g: 30.1 }).carbs.score).toBe(1)
  })

  it('scores grams per kcal against the band edges (higher is better)', () => {
    // 1050 g against 1710.6 kcal is 0.61 g/kcal; adjust the weight
    // to land on each boundary.
    const volume = (grams: number) =>
      mustRate({ total_weight_grams: grams, total_calories: 1000 }).volume
    expect(volume(2000).score).toBe(5) // exactly 2.0 g/kcal
    expect(volume(1900).score).toBe(4)
    expect(volume(1500).score).toBe(4) // exactly 1.5 g/kcal
    expect(volume(1400).score).toBe(3)
    expect(volume(1000).score).toBe(3) // exactly 1.0 g/kcal
    expect(volume(900).score).toBe(2)
    expect(volume(600).score).toBe(2) // exactly 0.6 g/kcal
    expect(volume(500).score).toBe(1)
  })

  it('rates a genuinely fat-free recipe as excellent for fat', () => {
    expect(mustRate({ fat_per_100g: 0 }).fat.score).toBe(5)
    expect(mustRate({ fat_per_100g: 0 }).fat.band).toBe('Very low fat')
  })

  it('rounds the overall guide to one decimal', () => {
    // Fat 1 g → 5, fibre 3.5 g → 3, carbs 15 g → 3,
    // 540 g per 600 kcal = 0.9 g/kcal → 2; mean 3.25 → 3.3
    const ratings = ratedRecipe({
      fat_per_100g: 1,
      fibre_per_100g: 3.5,
      carbs_per_100g: 15,
      total_weight_grams: 540,
      total_calories: 600,
    })
    expect(ratings?.overall).toBe(3.3)
  })

  it('withholds every guide without a cooked weight or calories', () => {
    expect(ratedRecipe({ total_weight_grams: 0 })).toBeNull()
    expect(ratedRecipe({ total_calories: 0 })).toBeNull()
    expect(ratedRecipe({ total_weight_grams: Number.NaN })).toBeNull()
    expect(ratedRecipe({ fat_per_100g: Number.NaN })).toBeNull()
    expect(ratedRecipe({ carbs_per_100g: -1 })).toBeNull()
  })

  it('names each band in words for the guide', () => {
    const ratings = ratedRecipe()
    expect(ratings?.fat.band).toBe('Low fat')
    expect(ratings?.fibre.band).toBe('Low fibre')
    expect(ratings?.carbs.band).toBe('Moderate carbs')
    expect(ratings?.volume.band).toBe('Low volume')
  })
})
