// Fixture contract for recipe cuisines (issue #90, decision 123).
//
// The preview and the component/Vitest suites run against these handlers, so
// they must behave like internal/handlers/recipes.go: trimmed on the way in,
// replaceable and clearable through the metadata route, length-capped, and
// listed deduplicated.

import { beforeEach, describe, expect, it } from 'vitest'
import { handle } from './handler.mjs'
import { recipes, resetFixtures } from './seed.mjs'

const url = (path) => new URL(path, 'http://localhost')

function createRecipe(name, cuisine) {
  return handle(
    'POST',
    url('/api/recipes'),
    {
      name,
      description: '',
      instructions: '',
      serves: 2,
      total_weight_grams: 0,
      weight_is_manual: false,
      ingredients: [{ food_id: 5, quantity_grams: 200, sort_order: 0 }],
      text_ingredients: [],
      meal_occasions: [],
      dish_type: '',
      cuisine,
      key_food_ids: [],
      is_own_creation: false,
      total_time_minutes: null,
    },
  )
}

function setMetadata(id, cuisine) {
  return handle('PUT', url(`/api/recipes/${id}/metadata`), {
    meal_occasions: [],
    dish_type: '',
    key_food_ids: [],
    total_time_minutes: null,
    cuisine,
  })
}

const cuisines = () => handle('GET', url('/api/recipes/cuisines'), null)

describe('fixture recipe cuisine API', () => {
  beforeEach(() => {
    resetFixtures()
  })

  it('stores a trimmed cuisine with a new recipe and echoes it back', () => {
    const result = createRecipe('Chicken tikka', '  Indian  ')
    expect(result?.status).toBe(201)
    expect(result?.body?.cuisine).toBe('Indian')
    expect(recipes.find((recipe) => recipe.name === 'Chicken tikka')?.cuisine).toBe('Indian')
  })

  it('replaces and clears the cuisine through the metadata route', () => {
    const created = createRecipe('Chicken tikka', 'Indian')
    const id = created?.body?.id
    expect(setMetadata(id, 'Mexican')?.body?.cuisine).toBe('Mexican')
    expect(setMetadata(id, '   ')?.body?.cuisine).toBeUndefined()
  })

  it('rejects an over-long cuisine without changing the recipe', () => {
    const created = createRecipe('Chicken tikka', 'Indian')
    const id = created?.body?.id
    expect(setMetadata(id, 'x'.repeat(41))?.status).toBe(400)
    expect(recipes.find((recipe) => recipe.id === id)?.cuisine).toBe('Indian')

    const rejected = createRecipe('Too long', 'x'.repeat(41))
    expect(rejected?.status).toBe(400)
    expect(recipes.some((recipe) => recipe.name === 'Too long')).toBe(false)
  })

  it('lists each cuisine once, sorted, and never returns an empty name', () => {
    createRecipe('A dish', 'Thai')
    createRecipe('Another dish', 'thai')
    const listed = cuisines()?.body
    expect(listed).toContain('Thai')
    expect(listed.filter((name) => name.toLowerCase() === 'thai')).toHaveLength(1)
    expect(listed).toEqual([...listed].sort((a, b) => a.localeCompare(b)))
    expect(listed).not.toContain('')
  })
})
