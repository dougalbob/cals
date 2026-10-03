import { apiGet, apiPut } from './client'
import type { Recipe, RecipeDetail, RecipeMetadataInput } from './types'

/**
 * The catalogue omits archived recipes unless asked. The Recipes page asks, so its
 * "Show archived" toggle can reveal them without another round trip; pickers that log a
 * recipe must keep the default and never offer an archived one (decision 59).
 */
export function getRecipes(options: { includeArchived?: boolean } = {}): Promise<Recipe[]> {
  return apiGet<Recipe[]>(options.includeArchived ? '/api/recipes?include_archived=true' : '/api/recipes')
}

export function getRecipe(id: number): Promise<RecipeDetail> {
  return apiGet<RecipeDetail>(`/api/recipes/${id}`)
}

export function setRecipeFavourite(id: number, isFavourite: boolean): Promise<{ is_favourite: boolean }> {
  return apiPut<{ is_favourite: boolean }>(`/api/recipes/${id}/favourite`, {
    is_favourite: isFavourite,
  })
}

/** Archive (hide, keep history) or restore a shared recipe. Household-wide; idempotent. */
export function setRecipeArchived(id: number, isArchived: boolean): Promise<RecipeDetail> {
  return apiPut<RecipeDetail>(`/api/recipes/${id}/archive`, { is_archived: isArchived })
}

export function updateRecipeMetadata(id: number, input: RecipeMetadataInput): Promise<RecipeDetail> {
  return apiPut<RecipeDetail>(`/api/recipes/${id}/metadata`, input)
}
