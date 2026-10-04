import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../api/client'
import { getRecipe, getRecipes, setRecipeArchived, setRecipeFavourite } from '../api/recipes'
import {
  RECIPE_DISH_TYPES,
  RECIPE_MEAL_OCCASIONS,
  type Recipe,
  type RecipeDishType,
  type RecipeMealOccasion,
  type RecipeDetail,
} from '../api/types'
import { RecipePortionSheet } from '../components/RecipePortionSheet'
import { RecipeTags } from '../components/RecipeTags'
import { formatShortDate, todayIso } from '../lib/format'
import {
  diaryHrefForPick,
  mealLabel,
  parseRecipePick,
  withRecipePick,
  type RecipePickIntent,
} from '../lib/recipePick'
import {
  dishTagKey,
  foodTagKey,
  matchesTags,
  occasionTagKey,
  parseTagParam,
  selectedTagKeys,
  serialiseTagParam,
  tagLabel,
  tagQuerySuffix,
  tagValue,
  toggleTag,
  type RecipeTagKind,
  type RecipeTagRef,
} from '../lib/recipeTags'

interface FavouriteVariables {
  id: number
  isFavourite: boolean
}

export function RecipesRoute() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [favouritesOnly, setFavouritesOnly] = useState(false)
  /** A view toggle, not a filter: archived recipes stay out of sight until asked for (decision 59). */
  const [showArchived, setShowArchived] = useState(false)

  /**
   * Logging from the Diary arrives here armed with the meal and date it started
   * from (`?add-to=&on=`), so the whole recipe box — search, favourites, tags —
   * is the picker, and the portion sheet opens already knowing where the entry
   * belongs. Owner request, 2026-10-03; see `src/lib/recipePick.ts`.
   */
  const today = todayIso()
  const pick = useMemo(() => parseRecipePick(searchParams, today), [searchParams, today])
  const [recipeToLog, setRecipeToLog] = useState<RecipeDetail | null>(null)
  const [loadingPickId, setLoadingPickId] = useState<number | null>(null)
  const [pickError, setPickError] = useState<string | null>(null)

  /** The list row carries the ids only, so a pick loads the full recipe first. */
  const startLogging = async (recipe: Recipe) => {
    setPickError(null)
    setLoadingPickId(recipe.id)
    try {
      setRecipeToLog(await getRecipe(recipe.id))
    } catch (error) {
      setPickError((error as Error).message)
    } finally {
      setLoadingPickId(null)
    }
  }

  /**
   * The tag selection is the filter state, and it lives in the URL (`?tags=`)
   * so tapping a tag survives a reload, browser Back and a trip to a recipe
   * detail page. `history.replace` keeps tapping tags from filling the back
   * stack with filter states, which on a phone turns "leave the list" into
   * several swipes.
   */
  const selectedTags = useMemo(() => parseTagParam(searchParams.get('tags')), [searchParams])

  const setSelectedTags = (next: string[]) => {
    const params = new URLSearchParams(searchParams)
    const serialised = serialiseTagParam(next)
    if (serialised) params.set('tags', serialised)
    else params.delete('tags')
    setSearchParams(params, { replace: true })
  }

  const toggleTagFilter = (tag: RecipeTagRef) => setSelectedTags(toggleTag(selectedTags, tag.key))

  /** The dropdowns are single-choice views of the same selection: they replace that facet's tags. */
  const setFacetTag = (key: string, kind: RecipeTagKind) => {
    const others = selectedTags.filter((selected) => !selected.startsWith(`${kind}:`))
    setSelectedTags(key ? [...others, key] : others)
  }

  const recipesQuery = useQuery({
    queryKey: queryKeys.recipes,
    // Ask for archived recipes too: the toggle below reveals them without another request.
    queryFn: () => getRecipes({ includeArchived: true }),
  })

  const restoreMutation = useMutation({
    mutationFn: (id: number) => setRecipeArchived(id, false),
    onSuccess: (_restored, id) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.recipes })
      void queryClient.invalidateQueries({ queryKey: queryKeys.recipe(id) })
    },
  })

  const favouriteMutation = useMutation({
    mutationFn: ({ id, isFavourite }: FavouriteVariables) => setRecipeFavourite(id, isFavourite),
    onMutate: async ({ id, isFavourite }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.recipes })
      const previous = queryClient.getQueryData<Recipe[]>(queryKeys.recipes)
      queryClient.setQueryData<Recipe[]>(queryKeys.recipes, (current) =>
        current?.map((recipe) =>
          recipe.id === id ? { ...recipe, is_favourite: isFavourite } : recipe,
        ),
      )
      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.recipes, context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.recipes }),
  })

  const archivedCount = useMemo(
    () => (recipesQuery.data ?? []).filter((recipe) => recipe.is_archived).length,
    [recipesQuery.data],
  )
  const activeTotal = (recipesQuery.data?.length ?? 0) - archivedCount

  const keyFoodOptions = useMemo(() => {
    const foods = new Map<number, string>()
    for (const recipe of recipesQuery.data ?? []) {
      if (recipe.is_archived && !showArchived) continue
      for (const food of recipe.key_foods) foods.set(food.food_id, food.food_name)
    }
    return [...foods.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [recipesQuery.data, showArchived])

  const matchingRecipes = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return (recipesQuery.data ?? []).filter((recipe) => {
      const searchableTags = [
        ...recipe.meal_occasions,
        recipe.dish_type ?? '',
        ...recipe.key_foods.map((food) => food.food_name),
      ]
        .join(' ')
        .toLocaleLowerCase()
      const matchesSearch =
        !term ||
        recipe.name.toLocaleLowerCase().includes(term) ||
        (recipe.description ?? '').toLocaleLowerCase().includes(term) ||
        searchableTags.includes(term)
      return (
        matchesSearch && matchesTags(recipe, selectedTags) && (!favouritesOnly || recipe.is_favourite)
      )
    })
  }, [favouritesOnly, recipesQuery.data, search, selectedTags])

  const visibleRecipes = useMemo(
    () => matchingRecipes.filter((recipe) => !recipe.is_archived),
    [matchingRecipes],
  )
  const visibleArchived = useMemo(
    () => (showArchived ? matchingRecipes.filter((recipe) => recipe.is_archived) : []),
    [matchingRecipes, showArchived],
  )

  const occasionTags = selectedTagKeys(selectedTags, 'occasion')
  const dishTags = selectedTagKeys(selectedTags, 'dish')
  const foodTags = selectedTagKeys(selectedTags, 'food')
  const occasionFilter = occasionTags.length === 1 ? tagValue(occasionTags[0]) : ''
  const dishTypeFilter = dishTags.length === 1 ? tagValue(dishTags[0]) : ''
  const keyFoodFilter = foodTags.length === 1 ? tagValue(foodTags[0]) : ''

  const hasFilters = Boolean(search || favouritesOnly || selectedTags.length > 0)
  const clearFilters = () => {
    setSearch('')
    setFavouritesOnly(false)
    setSelectedTags([])
  }

  const totalRecipes = activeTotal
  const resultSummary =
    totalRecipes === 0
      ? ''
      : visibleRecipes.length === totalRecipes
        ? `${totalRecipes} recipe${totalRecipes === 1 ? '' : 's'}`
        : `${visibleRecipes.length} of ${totalRecipes} recipes match`

  const detailTagSuffix = tagQuerySuffix(selectedTags)

  const emptyMessage =
    (recipesQuery.data?.length ?? 0) === 0
      ? 'No recipes yet. Your recipes will appear here.'
      : activeTotal === 0 && !showArchived
        ? 'All your recipes are archived. Turn on “Show archived” to restore one.'
        : 'No recipes match these filters.'

  if (recipesQuery.isPending) {
    return <p className="text-ink-light">Loading recipes…</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p className="m-0 text-xs uppercase tracking-wide text-ink-light">Your recipe box</p>
          <h2 className="m-0 text-lg font-semibold">Recipes</h2>
        </div>
        {pick ? (
          <Link
            to={diaryHrefForPick(pick)}
            className="text-sm font-medium text-primary-dark no-underline hover:underline"
          >
            Cancel
          </Link>
        ) : (
          <Link to="/" className="text-sm font-medium text-primary-dark no-underline hover:underline">
            Back to Today
          </Link>
        )}
      </header>

      {pick && (
        <section
          role="status"
          aria-label="Adding a recipe to the diary"
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl border border-primary/40 bg-primary/10 px-3 py-2"
        >
          <p className="m-0 text-sm">
            <span className="font-semibold">Pick a recipe for {mealLabel(pick.meal)}</span>
            <span className="text-ink-light">
              {' '}· {pick.date === today ? 'today' : formatShortDate(pick.date)}. Search, favourites and
              tags all work as usual.
            </span>
          </p>
          <Link
            to={diaryHrefForPick(pick)}
            className="min-h-9 shrink-0 rounded-xl border border-line bg-surface px-3 text-xs font-medium text-ink no-underline"
          >
            ← Back to the diary
          </Link>
        </section>
      )}

      {pickError && (
        <p role="alert" className="m-0 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          Could not open that recipe: {pickError}
        </p>
      )}

      {recipesQuery.isError && (
        <p role="alert" className="m-0 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          Could not load recipes: {(recipesQuery.error as Error).message}
        </p>
      )}
      {restoreMutation.isError && (
        <p role="alert" className="m-0 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          Could not restore recipe: {(restoreMutation.error as Error).message}
        </p>
      )}
      {favouriteMutation.isError && (
        <p role="alert" className="m-0 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          Could not update favourite: {(favouriteMutation.error as Error).message}
        </p>
      )}

      <section className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card" aria-label="Recipe filters">
        <label className="sr-only" htmlFor="recipe-search">Search recipes</label>
        <input
          id="recipe-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search recipes…"
          className="min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base"
        />
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Recipe views">
          <ToggleChip
            label="Favourites"
            pressed={favouritesOnly}
            onClick={() => setFavouritesOnly((current) => !current)}
            icon={<HeartIcon filled={favouritesOnly} className="h-5 w-5" />}
          />
          <ToggleChip
            label="Archived"
            title={`Show archived recipes (${archivedCount})`}
            pressed={showArchived}
            disabled={archivedCount === 0}
            onClick={() => setShowArchived((current) => !current)}
            icon={<ArchiveIcon className="h-5 w-5" />}
          />
        </div>
        <details className="border-t border-line-light pt-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-primary-dark">
            Filter by occasion, dish type or key food
          </summary>
          <p className="mb-0 mt-1 text-xs text-ink-light">
            Or just tap a tag on a recipe card to filter the list.
          </p>
          <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-ink-light">
              Meal occasion
              <select
                aria-label="Filter by meal occasion"
                value={occasionFilter}
                onChange={(event) =>
                  setFacetTag(
                    event.target.value ? occasionTagKey(event.target.value as RecipeMealOccasion) : '',
                    'occasion',
                  )
                }
                className="min-h-11 rounded-xl border border-line bg-surface px-3 text-sm text-ink"
              >
                <option value="">{occasionTags.length > 1 ? 'Multiple — see tags' : 'Any occasion'}</option>
                {RECIPE_MEAL_OCCASIONS.map((occasion) => (
                  <option key={occasion.value} value={occasion.value}>{occasion.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-ink-light">
              Dish type
              <select
                aria-label="Filter by dish type"
                value={dishTypeFilter}
                onChange={(event) =>
                  setFacetTag(event.target.value ? dishTagKey(event.target.value as RecipeDishType) : '', 'dish')
                }
                className="min-h-11 rounded-xl border border-line bg-surface px-3 text-sm text-ink"
              >
                <option value="">{dishTags.length > 1 ? 'Multiple — see tags' : 'Any dish type'}</option>
                {RECIPE_DISH_TYPES.map((dishType) => (
                  <option key={dishType.value} value={dishType.value}>{dishType.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-ink-light">
              Key food
              <select
                aria-label="Filter by key food"
                value={keyFoodFilter}
                onChange={(event) =>
                  setFacetTag(event.target.value ? foodTagKey(Number(event.target.value)) : '', 'food')
                }
                className="min-h-11 rounded-xl border border-line bg-surface px-3 text-sm text-ink"
              >
                <option value="">{foodTags.length > 1 ? 'Multiple — see tags' : 'Any key food'}</option>
                {keyFoodOptions.map(([foodId, name]) => (
                  <option key={foodId} value={foodId}>{name}</option>
                ))}
              </select>
            </label>
          </div>
        </details>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="min-h-11 self-start rounded-xl border border-line px-3 text-sm font-medium text-primary-dark"
          >
            Clear filters
          </button>
        )}
      </section>

      {selectedTags.length > 0 && (
        <section
          aria-label="Active recipe tags"
          className="flex flex-col gap-2 rounded-2xl bg-card p-3 shadow-card"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-light">
              Filtering by
            </span>
            {selectedTags.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedTags(toggleTag(selectedTags, key))}
                aria-label={`Remove ${tagLabel(key, recipesQuery.data ?? [])} filter`}
                className="flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-white"
              >
                {tagLabel(key, recipesQuery.data ?? [])}
                <span aria-hidden="true" className="text-sm leading-none">×</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSelectedTags([])}
              className="min-h-11 rounded-xl px-2 text-xs font-medium text-primary-dark underline"
            >
              Clear tags
            </button>
          </div>
          <p className="m-0 text-xs text-ink-light">
            Every tag must match, so a second tap narrows the list further.
          </p>
        </section>
      )}

      {!(recipesQuery.isError && recipesQuery.data === undefined) && (
        <>
          <p role="status" className="m-0 text-xs font-medium text-ink-light">
            {resultSummary}
          </p>
          {visibleRecipes.length === 0 && visibleArchived.length === 0 ? (
            <section className="flex flex-col items-center gap-3 rounded-2xl bg-card p-6 text-center shadow-card">
              <p className="m-0 text-sm text-ink-light">{emptyMessage}</p>
              {hasFilters && recipesQuery.data?.length ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="min-h-11 rounded-xl border border-line px-3 text-sm font-medium text-primary-dark"
                >
                  Clear filters
                </button>
              ) : null}
            </section>
          ) : (
            <>
              {visibleRecipes.length > 0 && (
                <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2">
                  {visibleRecipes.map((recipe) => (
                    <li key={recipe.id}>
                      <RecipeCard
                        recipe={recipe}
                        detailTagSuffix={detailTagSuffix}
                        selectedTags={selectedTags}
                        savingFavourite={favouriteMutation.isPending}
                        onTagClick={toggleTagFilter}
                        onToggleFavourite={() =>
                          favouriteMutation.mutate({ id: recipe.id, isFavourite: !recipe.is_favourite })
                        }
                        // While the Diary is waiting for a choice, each card can log
                        // straight to it. `visibleRecipes` is never archived, so decision
                        // 59's rule can only bite the archived section below.
                        pickIntent={pick}
                        logging={loadingPickId === recipe.id}
                        onLog={pick === null ? undefined : () => void startLogging(recipe)}
                      />
                    </li>
                  ))}
                </ul>
              )}
              {visibleArchived.length > 0 && (
                <section aria-labelledby="archived-recipes-title" className="flex flex-col gap-3">
                  <div>
                    <h3 id="archived-recipes-title" className="m-0 text-base font-semibold">
                      Archived recipes ({visibleArchived.length})
                    </h3>
                    <p className="mb-0 mt-1 text-xs text-ink-light">
                      Hidden from the list and from logging. Past Diary entries keep these recipes
                      exactly as they were. Restore one to use it again.
                    </p>
                  </div>
                  <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2">
                    {visibleArchived.map((recipe) => (
                      <li key={recipe.id}>
                        <RecipeCard
                          recipe={recipe}
                          detailTagSuffix={detailTagSuffix}
                          selectedTags={selectedTags}
                          savingFavourite={false}
                          restoring={restoreMutation.isPending && restoreMutation.variables === recipe.id}
                          onTagClick={toggleTagFilter}
                          onToggleFavourite={() => undefined}
                          onRestore={() => restoreMutation.mutate(recipe.id)}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </>
      )}

      {pick && recipeToLog && (
        <RecipePortionSheet
          recipe={recipeToLog}
          initialMeal={pick.meal}
          initialDate={pick.date}
          onClose={() => setRecipeToLog(null)}
          // Straight back to the meal the request came from, so the diary shows
          // what was just logged without a hunt for it.
          onDone={() => {
            setRecipeToLog(null)
            navigate(diaryHrefForPick(pick))
          }}
        />
      )}
    </div>
  )
}

function RecipeCard({
  recipe,
  detailTagSuffix,
  selectedTags,
  savingFavourite,
  restoring = false,
  pickIntent = null,
  logging = false,
  onTagClick,
  onToggleFavourite,
  onRestore,
  onLog,
}: {
  recipe: Recipe
  /** Carries the current filter to the detail page, so its back link returns to this list. */
  detailTagSuffix: string
  selectedTags: readonly string[]
  savingFavourite: boolean
  restoring?: boolean
  /** The diary meal + date this list is logging to, when it is acting as a picker. */
  pickIntent?: RecipePickIntent | null
  /** True while the recipe's own detail is being fetched for the portion sheet. */
  logging?: boolean
  onTagClick: (tag: RecipeTagRef) => void
  onToggleFavourite: () => void
  /** Only archived cards offer Restore; it replaces the favourite heart. */
  onRestore?: () => void
  /** Only offered in pick mode: log a portion of this recipe straight to the diary. */
  onLog?: () => void
}) {
  // The detail page is part of the same flow while a pick is in progress, so it
  // inherits the intent: filters and "which meal, which date" both survive the
  // detour, and its own "Add to diary" button arrives pre-filled.
  const detailHref = withRecipePick(`/recipes/${recipe.id}${detailTagSuffix}`, pickIntent)
  const imageUrl = recipe.image_filename
    ? `/api/images/recipes/${recipe.id}/thumb${recipe.updated_at ? `?v=${encodeURIComponent(recipe.updated_at)}` : ''}`
    : null

  return (
    <article
      className="h-full overflow-hidden rounded-2xl bg-card shadow-card"
      aria-label={recipe.is_archived ? `${recipe.name} (archived)` : undefined}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-emerald-700 via-green-600 to-green-900">
        <Link
          to={detailHref}
          aria-label={`View ${recipe.name}`}
          className={`absolute inset-0 z-0 block ${recipe.is_archived ? 'opacity-70 saturate-50' : ''}`}
        >
          {imageUrl ? (
            <img src={imageUrl} alt="" aria-hidden="true" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-white">
              <span aria-hidden="true" className="text-6xl drop-shadow">🍲</span>
              <span className="text-xs font-medium tracking-wide text-white/90">NO PHOTO YET</span>
            </div>
          )}
        </Link>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />
        <RecipeTags
          recipe={recipe}
          selectedKeys={selectedTags}
          onTagClick={onTagClick}
          className="absolute bottom-3 left-3 right-16 z-10"
        />
        {recipe.times_logged > 0 && (
          <span
            role="img"
            data-recipe-log-count
            aria-label={`Logged ${recipe.times_logged} ${recipe.times_logged === 1 ? 'time' : 'times'}`}
            className="absolute left-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold tabular-nums leading-none text-white shadow-card"
          >
            {recipe.times_logged}
          </span>
        )}
        {recipe.is_archived && (
          <span className="absolute right-3 top-3 z-10 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white">
            Archived
          </span>
        )}
        {!recipe.is_archived && (
          <button
            type="button"
            data-favourite-hit-target
            onClick={onToggleFavourite}
            disabled={savingFavourite}
            aria-label={`${recipe.is_favourite ? 'Remove' : 'Add'} ${recipe.name} ${recipe.is_favourite ? 'from' : 'to'} favourites`}
            aria-pressed={recipe.is_favourite}
            className="absolute right-0 top-0 z-20 h-[66px] w-[66px] cursor-pointer border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span
              data-favourite-badge
              aria-hidden="true"
              className="absolute right-3 top-3 flex h-[33px] w-[33px] items-center justify-center rounded-full bg-white/95 shadow-card"
            >
              <HeartIcon filled={recipe.is_favourite} className="h-[18px] w-[18px]" />
            </span>
          </button>
        )}
      </div>

      <div className="p-4">
        <h3 className="m-0 truncate text-base font-semibold">
          <Link to={detailHref} className="text-ink no-underline hover:underline">
            {recipe.name}
          </Link>
        </h3>
        {recipe.description && (
          <p className="mb-0 mt-1 line-clamp-2 min-h-10 text-sm text-ink-light">{recipe.description}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-light pt-3 text-xs text-ink-light">
          <span className="font-semibold tabular-nums text-ink">
            {Math.round(recipe.calories_per_100g)} kcal / 100 g
          </span>
          {recipe.serves > 1 && <span>Serves {recipe.serves}</span>}
          {recipe.total_weight_grams > 0 && <span>{Math.round(recipe.total_weight_grams)} g cooked</span>}
          {recipe.total_time_minutes !== null && <span>{recipe.total_time_minutes} min</span>}
        </div>
        {recipe.is_archived && onRestore && (
          <button
            type="button"
            onClick={onRestore}
            disabled={restoring}
            aria-label={`Restore ${recipe.name}`}
            className="mt-3 min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {restoring ? 'Restoring…' : 'Restore'}
          </button>
        )}
        {onLog && pickIntent && (
          <button
            type="button"
            onClick={onLog}
            disabled={logging}
            aria-label={`Add ${recipe.name} to ${mealLabel(pickIntent.meal)} on ${pickIntent.date}`}
            className="mt-3 min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {logging ? 'Opening…' : `🍽 Add to ${mealLabel(pickIntent.meal)}`}
          </button>
        )}
      </div>
    </article>
  )
}

/** The favourite heart, shared by the card button and the Favourites toggle so they always match. */
function HeartIcon({ filled, className }: { filled: boolean; className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`${className} ${filled ? 'fill-red-600 stroke-red-600 drop-shadow-[0_1px_2px_rgba(127,29,29,0.55)]' : 'fill-none stroke-red-600'}`}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
    </svg>
  )
}

/** An archive box: lid, body and a handle slot. */
function ArchiveIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`${className} fill-none stroke-current`}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.5" y="3.5" width="19" height="5" rx="1.2" />
      <path d="M4.5 8.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V8.5" />
      <path d="M10 12.5h4" />
    </svg>
  )
}

/** An icon + label pill that behaves as an on/off button (aria-pressed), for list views. */
function ToggleChip({
  label,
  title,
  icon,
  pressed,
  disabled = false,
  onClick,
}: {
  label: string
  title?: string
  icon: ReactNode
  pressed: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      title={title}
      className={`flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium disabled:opacity-50 ${
        pressed ? 'border-primary bg-primary/10 text-primary-dark' : 'border-line bg-surface text-ink'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
