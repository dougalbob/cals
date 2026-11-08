import { describe, expect, it } from 'vitest'
import {
  defaultServing,
  matchingServing,
  preferredQuantityMode,
  servingChoices,
} from './foodServings'

describe('servingChoices', () => {
  it('puts the preferred serving first and keeps the food’s other measures', () => {
    const choices = servingChoices({
      serving_name: '1 bag',
      serving_grams: 25,
      servings: [
        { id: 1, description: '1 bag', grams: 25 },
        { id: 2, description: '2 bags', grams: 50 },
      ],
    })

    expect(choices.map((choice) => [choice.label, choice.grams])).toEqual([
      ['1 bag', 25],
      ['2 bags', 50],
    ])
  })

  it('never invents a unit: a food with no measures offers grams only', () => {
    expect(servingChoices({})).toEqual([])
    expect(servingChoices({ serving_grams: 0, servings: [] })).toEqual([])
    expect(preferredQuantityMode({ servings: [] })).toBe('grams')
    expect(defaultServing({ servings: [] })).toBeNull()
  })

  it('ignores unusable measures and names a nameless one by its weight', () => {
    const choices = servingChoices({
      servings: [
        { id: 1, description: '  ', grams: 44 },
        { id: 2, description: 'Zero', grams: 0 },
        { id: 3, description: 'Negative', grams: -5 },
      ],
    })

    expect(choices.map((choice) => [choice.label, choice.grams])).toEqual([['44 g', 44]])
  })

  it('collapses a measure repeated as both the preferred serving and a row', () => {
    const choices = servingChoices({
      serving_name: '1 slice',
      serving_grams: 44,
      servings: [{ id: 1, description: '1 slice', grams: 44 }],
    })

    expect(choices).toHaveLength(1)
  })

  it('marks FatSecret-provided measures so the editor can keep them read-only', () => {
    const choices = servingChoices({
      servings: [{ id: 1, description: '40g portion', grams: 40, fatsecret_serving_id: 'abc' }],
    })

    expect(choices[0].fromFatSecret).toBe(true)
  })

  it('starts in serving mode when a real measure exists', () => {
    expect(preferredQuantityMode({ serving_name: '1 bag', serving_grams: 25 })).toBe('serving')
  })
})

describe('matchingServing', () => {
  const choices = servingChoices({
    serving_name: '1 bag',
    serving_grams: 25,
    servings: [{ id: 2, description: '2 bags', grams: 50 }],
  })

  it('finds the chosen measure within rounding tolerance', () => {
    expect(matchingServing(choices, 25)?.label).toBe('1 bag')
    expect(matchingServing(choices, 50.2)?.label).toBe('2 bags')
  })

  it('reports no match for a typed weight or an invalid value', () => {
    expect(matchingServing(choices, 33)).toBeNull()
    expect(matchingServing(choices, Number.NaN)).toBeNull()
  })
})
