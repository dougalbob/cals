import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router'
import { queryKeys } from '../api/client'
import { createRecipe, uploadRecipeImage } from '../api/recipes'
import type { RecipeCreateInput } from '../api/types'
import { RecipeCreationForm } from '../components/RecipeContentEditor'

/** Create a shared recipe definition; classification is saved with its content. */
export function RecipeCreateRoute() {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // Preserve catalogue filters and (if present) a Diary meal/date pick while
  // the user creates a recipe, so Back and the next action return to that flow.
  const returnToRecipes = `/recipes${location.search}`

  const createMutation = useMutation({
    mutationFn: async ({ input, photoFile }: { input: RecipeCreateInput; photoFile: File | null }) => {
      const recipe = await createRecipe(input)
      if (!photoFile) return { recipe, photoUploadError: null as string | null }

      try {
        const uploaded = await uploadRecipeImage(recipe.id, photoFile)
        return {
          recipe: { ...recipe, image_filename: uploaded.filename, updated_at: uploaded.updated_at },
          photoUploadError: null,
        }
      } catch (caught) {
        // Recipe creation is already committed. Navigate to it and let the
        // detail page offer a safe retry rather than encouraging a duplicate.
        return { recipe, photoUploadError: (caught as Error).message }
      }
    },
    onSuccess: ({ recipe, photoUploadError }) => {
      queryClient.setQueryData(queryKeys.recipe(recipe.id), recipe)
      void queryClient.invalidateQueries({ queryKey: queryKeys.recipes })
      navigate(`/recipes/${recipe.id}${location.search}`, {
        state: photoUploadError ? { recipePhotoUploadError: photoUploadError } : null,
      })
    },
  })

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <Link
          to={returnToRecipes}
          className="min-h-11 self-start py-2 text-sm font-medium text-primary-dark no-underline hover:underline"
        >
          ← Back to recipes
        </Link>
        <div>
          <p className="m-0 text-xs uppercase tracking-wide text-ink-light">Your recipe box</p>
          <h2 className="m-0 text-xl font-semibold">Create a recipe</h2>
          <p className="mb-0 mt-1 text-sm text-ink-light">
            Add cals Foods for nutrition, then describe the method and shared tags.
          </p>
        </div>
      </header>

      <section className="rounded-2xl bg-card p-4 shadow-card sm:p-5" aria-label="New recipe details">
        <RecipeCreationForm
          isSaving={createMutation.isPending}
          error={createMutation.isError ? (createMutation.error as Error).message : null}
          onCreate={(input, photoFile) => createMutation.mutateAsync({ input, photoFile }).then((result) => result.recipe)}
          onCancel={() => navigate(returnToRecipes)}
        />
      </section>
    </div>
  )
}
