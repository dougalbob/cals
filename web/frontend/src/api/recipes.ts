import { apiGet, apiPut } from './client'
import type { Recipe, RecipeDetail, RecipeMetadataInput } from './types'

export function getRecipes(): Promise<Recipe[]> {
  return apiGet<Recipe[]>('/api/recipes')
}

export function getRecipe(id: number): Promise<RecipeDetail> {
  return apiGet<RecipeDetail>(`/api/recipes/${id}`)
}

export function setRecipeFavourite(id: number, isFavourite: boolean): Promise<{ is_favourite: boolean }> {
  return apiPut<{ is_favourite: boolean }>(`/api/recipes/${id}/favourite`, {
    is_favourite: isFavourite,
  })
}

export function updateRecipeMetadata(id: number, input: RecipeMetadataInput): Promise<RecipeDetail> {
  return apiPut<RecipeDetail>(`/api/recipes/${id}/metadata`, input)
}
