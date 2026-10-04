// Shared in-memory recipe-definition maths for the fixture API. The real
// handler uses one SQLite transaction; the mock mirrors the resulting values
// while deliberately leaving Diary entry snapshots alone.
const round1 = (value) => Math.round(value * 10) / 10

const supportedMealOccasions = new Set(['breakfast', 'lunch', 'dinner', 'snack'])
const supportedDishTypes = new Set(['main', 'side', 'soup', 'salad', 'dessert'])

/** Build a new recipe in the fixture API using the same content rules as edits. */
export function buildNewRecipe(body, foods, id, creator) {
  const name = String(body?.name ?? '').trim()
  if (!name) return { error: 'Name is required' }
  if (body?.is_own_creation !== undefined && typeof body.is_own_creation !== 'boolean') {
    return { error: 'is_own_creation must be a boolean' }
  }

  const recipe = { id, name, key_foods: [] }
  const content = buildRecipeContentUpdate(recipe, { ...body, name }, foods)
  if (content.error) return content

  const occasions = body?.meal_occasions ?? []
  const dishType = body?.dish_type ?? ''
  const keyFoodIds = body?.key_food_ids ?? []
  const totalTime = body?.total_time_minutes ?? null
  if (!Array.isArray(occasions) || occasions.some((value) => !supportedMealOccasions.has(value))) {
    return { error: 'Unsupported meal occasion' }
  }
  if (new Set(occasions).size !== occasions.length) return { error: 'Duplicate meal occasion' }
  if (typeof dishType !== 'string' || (dishType !== '' && !supportedDishTypes.has(dishType))) {
    return { error: 'Unsupported dish type' }
  }
  if (!Array.isArray(keyFoodIds) || keyFoodIds.length > 2) return { error: 'Choose at most two key foods' }
  if (keyFoodIds.some((foodId) => !Number.isInteger(foodId) || foodId <= 0)) {
    return { error: 'Invalid key food ID' }
  }
  if (new Set(keyFoodIds).size !== keyFoodIds.length) return { error: 'Duplicate key food ID' }
  const ingredientByFood = new Map(content.content.ingredients.map((ingredient) => [ingredient.food_id, ingredient]))
  if (keyFoodIds.some((foodId) => !ingredientByFood.has(foodId))) {
    return { error: 'Key foods must be known foods already used in this recipe' }
  }
  if (totalTime !== null && (!Number.isInteger(totalTime) || totalTime <= 0)) {
    return { error: 'Total time must be a positive number of minutes' }
  }

  const now = new Date().toISOString()
  return {
    recipe: {
      ...recipe,
      ...content.content,
      name,
      image_filename: '',
      created_by_user_id: creator.id,
      created_by_name: creator.name || creator.email,
      created_at: now,
      is_archived: false,
      is_own_creation: Boolean(body?.is_own_creation),
      meal_occasions: [...occasions],
      dish_type: dishType || undefined,
      key_foods: keyFoodIds.map((foodId) => ({
        food_id: foodId,
        food_name: ingredientByFood.get(foodId).food_name,
      })),
      total_time_minutes: totalTime,
    },
  }
}

export function buildRecipeContentUpdate(recipe, body, foods) {
  if (body?.name != null && (typeof body.name !== 'string' || body.name !== recipe.name)) {
    return { error: 'Recipe names cannot be changed after creation' }
  }

  const serves = body?.serves === undefined ? 1 : Number(body.serves)
  if (!Number.isInteger(serves)) return { error: 'Serves must be a whole number' }

  const weightIsManual = body?.weight_is_manual === true
  const manualWeight = Number(body?.total_weight_grams ?? 0)
  if (weightIsManual && (!Number.isFinite(manualWeight) || manualWeight <= 0)) {
    return { error: 'A manually measured cooked weight must be greater than zero' }
  }

  const rawIngredients = body?.ingredients ?? []
  if (!Array.isArray(rawIngredients)) return { error: 'Ingredients must be a list' }
  const ingredients = []
  for (let index = 0; index < rawIngredients.length; index++) {
    const input = rawIngredients[index]
    const foodId = input?.food_id
    const food = Number.isInteger(foodId) && foodId > 0 ? foods.find((candidate) => candidate.id === foodId) : null
    if (!food) return { error: `Food ${String(foodId ?? '')} was not found` }
    const grams = Number(input?.quantity_grams)
    if (!Number.isFinite(grams) || grams <= 0) {
      return { error: 'Every food ingredient must have a weight greater than zero grams' }
    }
    ingredients.push({
      id: Number.isInteger(input.id) ? input.id : recipe.id * 1_000_000 + index + 1,
      recipe_id: recipe.id,
      food_id: food.id,
      food_name: food.name,
      quantity_grams: grams,
      calories: round1((food.calories_per_100g * grams) / 100),
      sort_order: Number.isInteger(input.sort_order) ? input.sort_order : index,
    })
  }

  const rawTextIngredients = body?.text_ingredients ?? []
  if (!Array.isArray(rawTextIngredients)) return { error: 'Text ingredients must be a list' }
  const textIngredients = []
  for (let index = 0; index < rawTextIngredients.length; index++) {
    const input = rawTextIngredients[index]
    const description = String(input?.description ?? '').trim()
    if (!description) return { error: 'Every text ingredient needs a description' }
    textIngredients.push({
      id: Number.isInteger(input.id) ? input.id : recipe.id * 1_000_000 + 500_000 + index + 1,
      recipe_id: recipe.id,
      description,
      sort_order: Number.isInteger(input.sort_order) ? input.sort_order : index,
    })
  }

  const totals = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fibre: 0,
  }
  let calculatedWeight = 0
  for (const ingredient of ingredients) {
    const food = foods.find((candidate) => candidate.id === ingredient.food_id)
    const multiplier = ingredient.quantity_grams / 100
    totals.calories += food.calories_per_100g * multiplier
    totals.protein += food.protein_per_100g * multiplier
    totals.carbs += food.carbs_per_100g * multiplier
    totals.fat += food.fat_per_100g * multiplier
    totals.fibre += food.fibre_per_100g * multiplier
    calculatedWeight += ingredient.quantity_grams
  }

  const roundedTotals = Object.fromEntries(
    Object.entries(totals).map(([key, value]) => [key, round1(value)]),
  )
  const calculatedWeightGrams = round1(calculatedWeight)
  const totalWeightGrams = round1(weightIsManual ? manualWeight : calculatedWeight)
  const per100 = (value) => totalWeightGrams > 0 ? round1((value / totalWeightGrams) * 100) : 0
  const usedFoodIds = new Set(ingredients.map((ingredient) => ingredient.food_id))

  return {
    content: {
      description: String(body?.description ?? ''),
      instructions: String(body?.instructions ?? ''),
      serves: Math.max(1, serves),
      calculated_weight_grams: calculatedWeightGrams,
      total_weight_grams: totalWeightGrams,
      weight_is_manual: weightIsManual,
      total_calories: roundedTotals.calories,
      total_protein: roundedTotals.protein,
      total_carbs: roundedTotals.carbs,
      total_fat: roundedTotals.fat,
      total_fibre: roundedTotals.fibre,
      calories_per_100g: per100(roundedTotals.calories),
      protein_per_100g: per100(roundedTotals.protein),
      carbs_per_100g: per100(roundedTotals.carbs),
      fat_per_100g: per100(roundedTotals.fat),
      fibre_per_100g: per100(roundedTotals.fibre),
      ingredients,
      text_ingredients: textIngredients,
      key_foods: (recipe.key_foods ?? [])
        .filter((keyFood) => usedFoodIds.has(keyFood.food_id))
        .map((keyFood) => {
          const food = foods.find((candidate) => candidate.id === keyFood.food_id)
          return { ...keyFood, food_name: food?.name ?? keyFood.food_name }
        }),
      updated_at: new Date().toISOString(),
    },
  }
}

export function recalculateRecipesUsingFood(recipes, foodId, foods) {
  for (const recipe of recipes) {
    if (!(recipe.ingredients ?? []).some((ingredient) => ingredient.food_id === foodId)) continue
    const result = buildRecipeContentUpdate(recipe, {
      name: recipe.name,
      description: recipe.description,
      instructions: recipe.instructions,
      serves: recipe.serves,
      total_weight_grams: recipe.total_weight_grams,
      weight_is_manual: recipe.weight_is_manual,
      ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient })),
      text_ingredients: (recipe.text_ingredients ?? []).map((ingredient) => ({ ...ingredient })),
    }, foods)
    if (!result.error) Object.assign(recipe, result.content)
  }
}
