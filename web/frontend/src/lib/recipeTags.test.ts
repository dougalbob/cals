import { describe, expect, it } from 'vitest'
import type { Recipe } from '../api/types'
import {
  dishTagKey,
  foodTagKey,
  matchesTags,
  OWN_CREATION_TAG_KEY,
  occasionTagKey,
  parseTagParam,
  recipeTags,
  recipesHref,
  selectedTagKeys,
  serialiseTagParam,
  tagLabel,
  tagQuerySuffix,
  tagValue,
  toggleTag,
} from './recipeTags'

type TaggableRecipe = Pick<Recipe, 'meal_occasions' | 'dish_type' | 'key_foods' | 'is_own_creation'>

const chickenPie: TaggableRecipe = {
  meal_occasions: ['dinner'],
  dish_type: 'main',
  is_own_creation: false,
  key_foods: [
    { food_id: 5, food_name: 'Chicken Breast, grilled' },
    { food_id: 25, food_name: 'Mushrooms, sliced' },
  ],
}

const porridge: TaggableRecipe = {
  meal_occasions: ['breakfast'],
  dish_type: undefined,
  is_own_creation: false,
  key_foods: [{ food_id: 1, food_name: 'Porridge Oats' }],
}

describe('recipeTags', () => {
  it('builds stable keys with display labels from the recipe', () => {
    expect(recipeTags(chickenPie)).toEqual([
      { key: 'occasion:dinner', kind: 'occasion', label: 'Dinner' },
      { key: 'dish:main', kind: 'dish', label: 'Main' },
      { key: 'food:5', kind: 'food', label: 'Chicken Breast, grilled', foodId: 5 },
      { key: 'food:25', kind: 'food', label: 'Mushrooms, sliced', foodId: 25 },
    ])
  })

  it('adds the own-creation marker before key foods so it stays grouped with the tag row', () => {
    expect(recipeTags({ ...chickenPie, is_own_creation: true })).toEqual([
      { key: 'occasion:dinner', kind: 'occasion', label: 'Dinner' },
      { key: 'dish:main', kind: 'dish', label: 'Main' },
      { key: OWN_CREATION_TAG_KEY, kind: 'origin', label: 'Own creation' },
      { key: 'food:5', kind: 'food', label: 'Chicken Breast, grilled', foodId: 5 },
      { key: 'food:25', kind: 'food', label: 'Mushrooms, sliced', foodId: 25 },
    ])
  })

  it('matches every selected tag (AND), not any of them', () => {
    expect(matchesTags(chickenPie, [])).toBe(true)
    expect(matchesTags(chickenPie, ['food:5'])).toBe(true)
    expect(matchesTags(chickenPie, ['food:5', 'food:25'])).toBe(true)
    expect(matchesTags(chickenPie, ['food:5', 'food:1'])).toBe(false)
    expect(matchesTags(chickenPie, ['occasion:breakfast'])).toBe(false)
    expect(matchesTags({ ...chickenPie, is_own_creation: true }, [OWN_CREATION_TAG_KEY])).toBe(true)
    expect(matchesTags(chickenPie, [OWN_CREATION_TAG_KEY])).toBe(false)
    expect(matchesTags(porridge, ['occasion:breakfast', 'food:1'])).toBe(true)
  })
})

describe('tag keys and the ?tags= parameter', () => {
  it('round-trips a selection, dropping unknown and duplicate keys', () => {
    const raw = 'food:5, occasion:dinner ,food:5,nonsense,food:abc,dish:main,origin:own,origin:other'
    expect(parseTagParam(raw)).toEqual(['food:5', 'occasion:dinner', 'dish:main', OWN_CREATION_TAG_KEY])
    expect(serialiseTagParam(parseTagParam(raw))).toBe('food:5,occasion:dinner,dish:main,origin:own')
    expect(parseTagParam(null)).toEqual([])
    expect(parseTagParam('')).toEqual([])
  })

  it('ignores the same key twice so a double tap cannot double-filter', () => {
    expect(toggleTag([], 'food:5')).toEqual(['food:5'])
    expect(toggleTag(['food:5'], 'food:5')).toEqual([])
    expect(toggleTag(['food:5'], 'food:25')).toEqual(['food:5', 'food:25'])
  })

  it('exposes the parts the controls need', () => {
    expect(selectedTagKeys(['food:5', 'dish:main', 'food:25'], 'food')).toEqual(['food:5', 'food:25'])
    expect(tagValue('food:25')).toBe('25')
    expect(occasionTagKey('lunch')).toBe('occasion:lunch')
    expect(dishTagKey('dessert')).toBe('dish:dessert')
    expect(foodTagKey(11)).toBe('food:11')
  })

  it('links to the catalogue with the selection encoded', () => {
    expect(tagQuerySuffix([])).toBe('')
    expect(recipesHref([])).toBe('/recipes')
    expect(tagQuerySuffix(['food:5', 'food:25'])).toBe('?tags=food%3A5%2Cfood%3A25')
    expect(recipesHref(['occasion:lunch'])).toBe('/recipes?tags=occasion%3Alunch')
  })

  it('labels a tag from the catalogue, with a fallback for a stale food key', () => {
    expect(tagLabel('occasion:lunch')).toBe('Lunch')
    expect(tagLabel('dish:soup')).toBe('Soup')
    expect(tagLabel(OWN_CREATION_TAG_KEY)).toBe('Own creation')
    expect(tagLabel('food:25', [chickenPie, porridge])).toBe('Mushrooms, sliced')
    // A food that no loaded recipe marks as key cannot be named — but it stays
    // visible and removable rather than becoming an invisible filter.
    expect(tagLabel('food:999', [chickenPie])).toBe('Food #999')
  })
})
