import { apiDelete, apiGet, apiPost, apiPut } from './client'
import type { Food, FoodInput } from './types'

/**
 * Food catalogue calls. Grams stay canonical: every named measure a food
 * carries is just a name for a number of grams (owner decision 30).
 */
export function getCustomFoods(): Promise<Food[]> {
  return apiGet<Food[]>('/api/foods/custom')
}

export function getFood(id: number | string): Promise<Food> {
  return apiGet<Food>(`/api/foods/${id}`)
}

export function createFood(input: FoodInput): Promise<Food> {
  return apiPost<Food>('/api/foods', input)
}

export function updateFood(id: number, input: FoodInput): Promise<Food> {
  return apiPut<Food>(`/api/foods/${id}`, input)
}

export function deleteFood(id: number): Promise<void> {
  return apiDelete<void>(`/api/foods/${id}`)
}
