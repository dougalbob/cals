import { describe, expect, it } from 'vitest'
import {
  diaryHrefForDate,
  diaryHrefForPick,
  mealLabel,
  parseRecipePick,
  startRecipePickHref,
  withRecipePick,
} from './recipePick'

const TODAY = '2026-10-07'

describe('parseRecipePick', () => {
  it('reads the meal and date the diary armed the recipe box with', () => {
    expect(parseRecipePick(new URLSearchParams('add-to=breakfast&on=2026-10-01'), TODAY)).toEqual({
      meal: 'breakfast',
      date: '2026-10-01',
    })
  })

  it('is absent, not broken, when no pick is in progress', () => {
    expect(parseRecipePick(new URLSearchParams('tags=occasion:lunch'), TODAY)).toBeNull()
    expect(parseRecipePick(new URLSearchParams(), TODAY)).toBeNull()
  })

  it('ignores an unknown meal slot rather than guessing one', () => {
    // A stale or hand-edited link must not silently log to a meal nobody asked for.
    expect(parseRecipePick(new URLSearchParams('add-to=supper&on=2026-10-01'), TODAY)).toBeNull()
    expect(parseRecipePick(new URLSearchParams('add-to='), TODAY)).toBeNull()
  })

  it('falls back to today when the date is missing or malformed', () => {
    expect(parseRecipePick(new URLSearchParams('add-to=dinner'), TODAY)).toEqual({
      meal: 'dinner',
      date: TODAY,
    })
    expect(
      parseRecipePick(new URLSearchParams('add-to=dinner&on=01/10/2026'), TODAY),
    ).toEqual({ meal: 'dinner', date: TODAY })
  })
})

describe('startRecipePickHref', () => {
  it('is the round trip the diary and the recipe box agree on', () => {
    const href = startRecipePickHref('lunch', '2026-09-30')
    expect(href).toBe('/recipes?add-to=lunch&on=2026-09-30')
    expect(parseRecipePick(new URLSearchParams(href.split('?')[1]), TODAY)).toEqual({
      meal: 'lunch',
      date: '2026-09-30',
    })
  })
})

describe('withRecipePick', () => {
  it('leaves a plain href alone when no pick is in progress', () => {
    expect(withRecipePick('/recipes/7', null)).toBe('/recipes/7')
  })

  it('appends to a query that is already there, so filters survive the detour', () => {
    expect(withRecipePick('/recipes/7?tags=food%3A11', { meal: 'snacks', date: TODAY })).toBe(
      `/recipes/7?tags=food%3A11&add-to=snacks&on=${TODAY}`,
    )
  })

  it('keeps the intent readable through the link the card hands to the detail page', () => {
    const href = withRecipePick('/recipes/7', { meal: 'dinner', date: '2026-10-05' })
    const params = new URLSearchParams(href.slice(href.indexOf('?') + 1))
    expect(parseRecipePick(params, TODAY)).toEqual({ meal: 'dinner', date: '2026-10-05' })
  })
})

describe('diaryHrefForPick', () => {
  it('returns to the day and scrolls to the meal the request came from', () => {
    expect(diaryHrefForPick({ meal: 'breakfast', date: '2026-10-01' })).toBe(
      '/diary/2026-10-01#breakfast',
    )
    expect(diaryHrefForDate('2026-10-01')).toBe('/diary/2026-10-01')
  })
})

describe('mealLabel', () => {
  it('uses the diary\'s own meal names', () => {
    expect(mealLabel('breakfast')).toBe('Breakfast')
    expect(mealLabel('snacks')).toBe('Snacks')
  })
})
