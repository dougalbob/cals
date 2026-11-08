import { describe, expect, it } from 'vitest'
import { SUGGESTED_RECIPE_CUISINES } from '../api/types'
import { cuisineOptions, cuisineValidationError } from './cuisine'
import { cuisineSlug } from './recipeTags'

describe('cuisineOptions', () => {
  it('offers the suggested cuisines first, in the owner’s order', () => {
    const options = cuisineOptions([])
    expect(options.slice(0, SUGGESTED_RECIPE_CUISINES.length)).toEqual([...SUGGESTED_RECIPE_CUISINES])
  })

  it('adds cuisines already in use, alphabetically, after the suggestions', () => {
    const options = cuisineOptions(['Peruvian', 'Indian', 'Greek'])
    expect(options.slice(SUGGESTED_RECIPE_CUISINES.length)).toEqual(['Greek', 'Peruvian'])
    // Already suggested: not repeated, and not reordered.
    expect(options.filter((name) => name === 'Indian')).toEqual(['Indian'])
  })

  it('treats two spellings of one cuisine as a single chip', () => {
    const options = cuisineOptions(['thai'], 'THAI ')
    // One chip, and the suggested spelling is the one shown.
    expect(options.filter((name) => cuisineSlug(name) === 'thai')).toEqual(['Thai'])
  })

  it('keeps a non-suggested cuisine’s own spelling', () => {
    const options = cuisineOptions(['peruvian'], 'PERUVIAN ')
    expect(options.filter((name) => cuisineSlug(name) === 'peruvian')).toEqual(['peruvian'])
  })

  it('always includes the recipe’s own cuisine, so it can be removed', () => {
    const options = cuisineOptions([], 'Peruvian')
    expect(options).toContain('Peruvian')
    // It sits with the other non-suggested cuisines, not in the suggested set.
    expect(options.indexOf('Peruvian')).toBeGreaterThanOrEqual(SUGGESTED_RECIPE_CUISINES.length)
  })

  it('ignores blank names', () => {
    expect(cuisineOptions(['', '   '], '  ')).toEqual([...SUGGESTED_RECIPE_CUISINES])
  })
})

describe('cuisineValidationError', () => {
  it('accepts a normal cuisine and rejects the rest', () => {
    expect(cuisineValidationError('Peruvian', 40)).toBeNull()
    expect(cuisineValidationError('  Korean  ', 40)).toBeNull()
    expect(cuisineValidationError('   ', 40)).toBe('Type the cuisine you want to add.')
    expect(cuisineValidationError('x'.repeat(41), 40)).toBe(
      'Keep the cuisine to 40 characters or fewer.',
    )
    // A name made only of punctuation cannot be turned into a tag key.
    expect(cuisineValidationError('!!!', 40)).toBe('Use at least one letter or number.')
  })
})
