// Shared in-memory recipe-definition maths for the fixture API. The real
// handler uses one SQLite transaction; the mock mirrors the resulting values
// while deliberately leaving Diary entry snapshots alone.
const round1 = (value) => Math.round(value * 10) / 10

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
