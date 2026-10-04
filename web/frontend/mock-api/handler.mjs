/**
 * SPIKE fixture API.
 *
 * Implements a subset of cals' read endpoints with response bodies shaped to
 * match the Go handlers in internal/handlers/*.go — same JSON field names,
 * same ordering, same nullability. This is what makes the spike honest: the UI
 * can be pointed at the real Go server (VITE_API_TARGET) without any changes.
 *
 * Mapped:  /api/version, /api/users/me, /api/recipes (GET/POST/detail, content + favourite + metadata + archive PUT),
 *          /api/recipes/{id}/image (POST), /api/images/recipes/{id}/{type} (GET),
 *          /api/foods/search, /api/foods/custom (+ POST/PUT/DELETE), /api/diary (+ POST/PUT/DELETE),
 *          /api/bank, /api/calendar, /api/drinks, /api/weight, /api/measurements,
 *          /api/stats/calories, /api/stats/bank, /api/nutrition/*
 * Supported mutations include Diary/drink demos, recipe create/content/favourite/metadata/archive
 * edits, uncropped photo upload/replacement, and dependent nutrition refreshes. Unsupported
 * mutations (including photo cropping) return 501 with a clear message.
 */

import * as seed from './seed.mjs'
import { buildNewRecipe, buildRecipeContentUpdate, recalculateRecipesUsingFood } from './recipe-content.mjs'

const {
  foods, recipes, drinks, drinkEntries, weightEntries, measurements,
  nutritionSettings, user, TODAY,
} = seed

const round1 = (n) => Math.round(n * 10) / 10
const num = (v) => (Number.isFinite(v) ? round1(v) : 0)
let recipeImageVersionSeq = 0

// ---------------------------------------------------------------------------
// Bank maths — copied from internal/handlers/bank.go so the numbers agree
// ---------------------------------------------------------------------------

function bank(asOfDate) {
  const dailyGoal = user.daily_calorie_goal
  const startDate = user.bank_start_date
  const base = { daily_goal: dailyGoal, bank_balance: 0, today_available: dailyGoal, start_date: startDate, as_of_date: asOfDate }

  if (!startDate || asOfDate <= startDate) return base

  const dayCount = seed.daysBetween(startDate, asOfDate)
  if (dayCount <= 0) return base

  // Drinks count towards the bank (mirrors internal/handlers/bank.go).
  const consumed = seed.caloriesBetween(startDate, asOfDate) + seed.drinkCaloriesBetween(startDate, asOfDate)
  const bankBalance = dayCount * dailyGoal - Math.trunc(consumed)
  return { ...base, bank_balance: bankBalance, today_available: dailyGoal + bankBalance }
}

// ---------------------------------------------------------------------------
// Nutrition analysis — mirrors internal/handlers/nutrition.go
// ---------------------------------------------------------------------------

function nutritionAnalysis(days = 7) {
  const daily = []
  let daysWithData = 0

  for (let back = days - 1; back >= 0; back--) {
    const date = seed.dateOffset(back)
    const t = seed.totalsFor(date)
    const totalCal = t.calories
    const proteinKcal = t.protein * 4
    const carbsKcal = t.carbs * 4
    const fatKcal = t.fat * 9
    const macroKcal = proteinKcal + carbsKcal + fatKcal

    const kg = currentWeightKg()
    daily.push({
      date,
      calories: num(totalCal),
      protein: num(t.protein),
      carbs: num(t.carbs),
      fat: num(t.fat),
      fibre: num(t.fibre),
      protein_percent: macroKcal ? num((proteinKcal / macroKcal) * 100) : 0,
      carbs_percent: macroKcal ? num((carbsKcal / macroKcal) * 100) : 0,
      fat_percent: macroKcal ? num((fatKcal / macroKcal) * 100) : 0,
      protein_per_kg: kg ? num(t.protein / kg) : 0,
    })
    if (t.calories > 0) daysWithData++
  }

  const withData = daily.filter((d) => d.calories > 0)
  const n = withData.length || 1
  const avg = (key) => num(withData.reduce((acc, d) => acc + d[key], 0) / n)

  const averages = {
    calories: avg('calories'),
    protein: avg('protein'),
    carbs: avg('carbs'),
    fat: avg('fat'),
    fibre: avg('fibre'),
    protein_percent: avg('protein_percent'),
    carbs_percent: avg('carbs_percent'),
    fat_percent: avg('fat_percent'),
    protein_per_kg: avg('protein_per_kg'),
  }

  const status = {
    protein: statusFor(averages.protein_per_kg, nutritionSettings.protein_goal_per_kg, 'min'),
    carbs: bandStatus(averages.carbs_percent, nutritionSettings.carb_min_percent, nutritionSettings.carb_max_percent),
    fat: statusFor(averages.fat_percent, nutritionSettings.fat_max_percent, 'max'),
    fibre: statusFor(averages.fibre, nutritionSettings.fibre_goal, 'min'),
  }

  return {
    start_date: daily[0].date,
    end_date: daily[daily.length - 1].date,
    daily_data: daily,
    averages,
    status,
    current_weight_kg: currentWeightKg(),
    settings: nutritionSettings,
    days_with_data: daysWithData,
  }
}

function currentWeightKg() {
  const latest = [...weightEntries].sort((a, b) => b.date.localeCompare(a.date))[0]
  return latest ? latest.weight_kg : 0
}

function statusFor(value, goal, direction) {
  if (!goal) return 'green'
  const ratio = value / goal
  if (direction === 'min') {
    if (ratio >= 1) return 'green'
    return ratio >= 0.85 ? 'amber' : 'red'
  }
  if (ratio <= 1) return 'green'
  return ratio <= 1.15 ? 'amber' : 'red'
}

function bandStatus(value, min, max) {
  if (value >= min && value <= max) return 'green'
  const slack = value < min ? (min - value) / min : (value - max) / max
  return slack <= 0.1 ? 'amber' : 'red'
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export function handle(method, url, body) {
  const { pathname, searchParams } = url
  const today = seed.TODAY

  // --- unprotected ---------------------------------------------------------
  if (pathname === '/api/version') return json({ version: '1.7.0-spike' })
  if (pathname === '/health') return { status: 200, body: 'OK', contentType: 'text/plain' }

  // --- test-only fixture control ------------------------------------------
  // The Playwright suite mutates this shared, in-process fixture state, so it
  // needs a way back to the seeded baseline between specs. This route exists
  // only in the fixture API (serve-preview.mjs and the Vite plugin) and has no
  // equivalent in the Go server, which owns a real SQLite database instead.
  if (pathname === '/api/_test/reset' && method === 'POST') {
    seed.resetFixtures()
    recipeImageVersionSeq = 0
    return json({ reset: true, today: seed.TODAY })
  }

  // --- read endpoints ------------------------------------------------------
  if (pathname === '/api/users/me' && method === 'GET') return json(user)

  if (pathname === '/api/recipes' && method === 'GET') {
    // Decision 59: archived recipes are hidden unless the caller opts in, as in the Go handler.
    const includeArchived = searchParams.get('include_archived') === 'true'
    return json(
      recipes
        .filter((recipe) => includeArchived || !recipe.is_archived)
        .map((recipe) => recipeResponse(recipe)),
    )
  }

  const recipeDetailMatch = pathname.match(/^\/api\/recipes\/(\d+)$/)
  if (recipeDetailMatch && method === 'GET') {
    const recipe = recipes.find((item) => item.id === Number(recipeDetailMatch[1]))
    if (!recipe) return err(404, 'Recipe not found')
    return json(recipeResponse(recipe))
  }

  const recipeImageReadMatch = pathname.match(/^\/api\/images\/recipes\/(\d+)\/(?:thumb|original)$/)
  if (recipeImageReadMatch && method === 'GET') {
    const recipe = recipes.find((item) => item.id === Number(recipeImageReadMatch[1]))
    if (!recipe || !recipe.image_filename) return err(404, 'Image not found')
    return {
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><defs><linearGradient id="g"><stop stop-color="#276749"/><stop offset="1" stop-color="#68d391"/></linearGradient></defs><rect width="640" height="400" fill="url(#g)"/><circle cx="320" cy="175" r="78" fill="#ffffff" fill-opacity=".25"/><path d="M260 205h120M280 150c10-28 70-28 80 0" stroke="#fff" stroke-width="10" stroke-linecap="round"/><text x="320" y="320" text-anchor="middle" fill="#fff" font-family="sans-serif" font-size="22">Fixture recipe photo</text></svg>',
    }
  }

  const recipeImageUploadMatch = pathname.match(/^\/api\/recipes\/(\d+)\/image$/)
  if (recipeImageUploadMatch && method === 'POST') {
    const recipe = recipes.find((item) => item.id === Number(recipeImageUploadMatch[1]))
    if (!recipe) return err(404, 'Recipe not found')
    const file = typeof body?.get === 'function' ? body.get('image') : body?.image
    if (!file || typeof file.size !== 'number') return err(400, 'Choose an image to upload')
    if (file.size <= 0) return err(400, 'The selected image is empty')
    if (file.size > 10 * 1024 * 1024) return err(413, 'Image too large (max 10 MB)')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return err(400, 'Choose a valid JPEG, PNG or WebP image')
    }
    recipeImageVersionSeq += 1
    const filename = `v_${recipeImageVersionSeq.toString(16).padStart(32, '0')}`
    recipe.image_filename = filename
    recipe.updated_at = new Date().toISOString()
    return json({ filename, updated_at: recipe.updated_at })
  }

  if (pathname === '/api/foods/search' && method === 'GET') {
    const q = (searchParams.get('q') ?? '').toLowerCase()
    if (q.length < 2) return json([])
    const results = foods
      .filter((f) => f.name.toLowerCase().includes(q) || (f.brand ?? '').toLowerCase().includes(q))
      .slice(0, 20)
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1
        const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1
        return aStarts - bStarts || a.name.localeCompare(b.name)
      })
      .map(foodResponse)
    return json(results)
  }

  const foodDetailMatch = pathname.match(/^\/api\/foods\/([^/]+)$/)
  if (foodDetailMatch && foodDetailMatch[1] !== 'custom' && method === 'GET') {
    const requestedId = foodDetailMatch[1]
    const food = requestedId.startsWith('fs_')
      ? foods.find((candidate) => String(candidate.fatsecret_id ?? '') === requestedId.slice(3))
      : seed.findFood(requestedId)
    if (!food) return err(404, 'Food not found')
    // A FatSecret id resolves to the fixture's already-cached local Food row,
    // matching HandleGetFood and ensuring recipe writes only receive numeric IDs.
    return json(foodResponse(food))
  }

  if (pathname === '/api/foods/custom' && method === 'GET') {
    return json(
      foods
        .filter((f) => f.fatsecret_id == null)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(foodResponse),
    )
  }

  if (pathname === '/api/diary' && method === 'GET') {
    const date = searchParams.get('date') ?? today
    const entries = seed.entriesFor(date).map((entry) => {
      const food = entry.food_id != null ? seed.findFood(entry.food_id) : null
      const recipe = entry.recipe_id != null ? recipes.find((item) => item.id === entry.recipe_id) : null
      return {
        ...entry,
        ...(food ? { food_name: food.name } : {}),
        ...(recipe ? { recipe_name: recipe.name } : {}),
        ...(entry.food_id != null ? seed.foodMeasuresFor(entry.food_id) : {}),
      }
    })
    return json({ date, entries, totals: seed.totalsFor(date) })
  }

  if (pathname === '/api/bank' && method === 'GET') {
    const date = searchParams.get('date')
    if (!date) return err(400, 'date parameter is required')
    return json(bank(date))
  }

  if (pathname === '/api/drinks' && method === 'GET') return json(drinks)

  if (pathname === '/api/drinks/entries' && method === 'GET') {
    const date = searchParams.get('date') ?? today
    return json(seed.drinkEntriesFor(date))
  }

  // Water: one source of truth — drink entries for water-counting drinks.
  if (pathname === '/api/water' && method === 'GET') {
    const date = searchParams.get('date') ?? today
    return json(seed.waterFor(date))
  }

  if (pathname === '/api/weight' && method === 'GET') {
    const days = Number.parseInt(searchParams.get('days') ?? '90', 10) || 90
    const from = seed.dateOffset(days)
    return json(
      weightEntries
        .filter((e) => e.date >= from)
        .sort((a, b) => b.date.localeCompare(a.date)),
    )
  }

  if (pathname === '/api/measurements' && method === 'GET') {
    return json(
      [...measurements]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((m) => ({
          date: m.date,
          bust_cm: m.bust_cm ?? null,
          chest_cm: m.chest_cm ?? null,
          waist_cm: m.waist_cm ?? null,
          hips_cm: m.hips_cm ?? null,
          upper_arm_cm: m.upper_arm_cm ?? null,
          thigh_cm: m.thigh_cm ?? null,
          neck_cm: m.neck_cm ?? null,
        })),
    )
  }

  if (pathname === '/api/stats/calories' && method === 'GET') {
    const days = clampDays(searchParams.get('days'))
    const out = []
    for (let back = days - 1; back >= 0; back--) {
      const date = seed.dateOffset(back)
      out.push({ date, calories: num(seed.totalsFor(date).calories), goal: user.daily_calorie_goal })
    }
    return json(out)
  }

  if (pathname === '/api/stats/bank' && method === 'GET') {
    const days = clampDays(searchParams.get('days'))
    const out = []
    for (let back = days - 1; back >= 0; back--) {
      const date = seed.dateOffset(back)
      out.push({ date, balance: bank(date).bank_balance })
    }
    return json(out)
  }

  if (pathname === '/api/nutrition/settings' && method === 'GET') return json(nutritionSettings)

  if (pathname === '/api/nutrition/weekly' && method === 'GET') {
    const days = clampDays(searchParams.get('days'), 7)
    return json(nutritionAnalysis(days))
  }

  // Calendar per-day summaries for month/week views (decision 49 follow-up).
  // Additive endpoint; mirrors internal/handlers/calendar.go.
  if (pathname === '/api/calendar' && method === 'GET') {
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    if (!from || !to) return err(400, 'from and to dates are required')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
      return err(400, 'invalid date format')
    const DAY_MS_LOCAL = 24 * 60 * 60 * 1000
    const startMs = Date.parse(`${from}T00:00:00Z`)
    const endMs = Date.parse(`${to}T00:00:00Z`)
    if (!(endMs >= startMs)) return err(400, 'to must be on or after from')
    const dayCount = Math.round((endMs - startMs) / DAY_MS_LOCAL) + 1
    if (dayCount > 400) return err(400, 'range exceeds 400 days')

    const days = []
    const waterDrinkIds = new Set(drinks.filter((d) => d.counts_toward_water).map((d) => d.id))
    const isoFromMs = (ms) => new Date(ms).toISOString().slice(0, 10)
    const addDays = (isoDate, n) => isoFromMs(Date.parse(`${isoDate}T00:00:00Z`) + n * 24 * 60 * 60 * 1000)
    let runningConsumed = 0
    // Seed running total from bank_start_date up to day before `from` so balances
    // stay correct when the window starts mid-run.
    const bankStart = user.bank_start_date
    if (bankStart && from > bankStart) {
      const dayBeforeFrom = addDays(from, -1)
      runningConsumed =
        seed.caloriesBetween(bankStart, addDays(dayBeforeFrom, 1)) +
        seed.drinkCaloriesBetween(bankStart, addDays(dayBeforeFrom, 1))
    }

    for (let i = 0; i < dayCount; i++) {
      const date = isoFromMs(startMs + i * 24 * 60 * 60 * 1000)
      const entries = seed.entriesFor(date)
      const meals = { breakfast: 0, lunch: 0, dinner: 0, snacks: 0 }
      let foodCal = 0
      for (const e of entries) {
        meals[e.meal] = Math.round((meals[e.meal] ?? 0) + e.calories)
        foodCal += e.calories
      }
      const drinkCal = seed
        .drinkEntriesFor(date)
        .reduce((acc, e) => acc + e.calories, 0)
      const hydrationMl = seed
        .drinkEntriesFor(date)
        .filter((e) => waterDrinkIds.has(e.drink_id))
        .reduce((acc, e) => acc + e.volume_ml, 0)
      const totalCal = foodCal + drinkCal

      // End-of-day bank balance: completed days from bankStart through `date`
      // times goal, minus total consumption in that window.
      let bankBalance = 0
      if (bankStart && date >= bankStart) {
        runningConsumed += totalCal
        const completed = seed.daysBetween(bankStart, addDays(date, 1))
        bankBalance = completed * user.daily_calorie_goal - Math.trunc(runningConsumed)
      }

      days.push({
        date,
        food_calories: num(foodCal),
        drink_calories: num(drinkCal),
        calories: num(totalCal),
        goal: user.daily_calorie_goal,
        hydration_ml: hydrationMl,
        hydration_target_ml: user.daily_water_goal_ml,
        bank_balance: bankBalance,
        meals,
        is_today: date === TODAY,
        has_data: totalCal > 0 || hydrationMl > 0,
      })
    }

    return json({
      from,
      to,
      daily_goal: user.daily_calorie_goal,
      bank_start: bankStart,
      days,
    })
  }

  // --- mutations so the authoring and logging flows are clickable ----------
  if (pathname === '/api/recipes' && method === 'POST') {
    const created = buildNewRecipe(body, foods, seed.nextRecipeId(), seed.user)
    if (created.error) return err(400, created.error)
    recipes.push(created.recipe)
    return json(recipeResponse(created.recipe), 201)
  }

  const recipeContentMatch = pathname.match(/^\/api\/recipes\/(\d+)$/)
  if (recipeContentMatch && method === 'PUT') {
    const recipe = recipes.find((item) => item.id === Number(recipeContentMatch[1]))
    if (!recipe) return err(404, 'Recipe not found')
    const updated = buildRecipeContentUpdate(recipe, body, foods)
    if (updated.error) return err(400, updated.error)
    Object.assign(recipe, updated.content)
    return json(recipeResponse(recipe))
  }

  const metadataMatch = pathname.match(/^\/api\/recipes\/(\d+)\/metadata$/)
  if (metadataMatch && method === 'PUT') {
    const recipe = recipes.find((item) => item.id === Number(metadataMatch[1]))
    if (!recipe) return err(404, 'Recipe not found')

    const occasions = body?.meal_occasions ?? []
    const dishType = body?.dish_type ?? ''
    const keyFoodIds = body?.key_food_ids ?? []
    const totalTime = body?.total_time_minutes ?? null
    const isOwnCreation = body?.is_own_creation
    const allowedOccasions = new Set(['breakfast', 'lunch', 'dinner', 'snack'])
    const allowedDishTypes = new Set(['main', 'side', 'soup', 'salad', 'dessert'])

    if (!Array.isArray(occasions) || occasions.some((value) => !allowedOccasions.has(value))) {
      return err(400, 'Unsupported meal occasion')
    }
    if (new Set(occasions).size !== occasions.length) return err(400, 'Duplicate meal occasion')
    if (typeof dishType !== 'string' || (dishType !== '' && !allowedDishTypes.has(dishType))) {
      return err(400, 'Unsupported dish type')
    }
    if (!Array.isArray(keyFoodIds) || keyFoodIds.length > 2) return err(400, 'Choose at most two key foods')
    if (keyFoodIds.some((id) => !Number.isInteger(id) || id <= 0)) return err(400, 'Invalid key food ID')
    if (new Set(keyFoodIds).size !== keyFoodIds.length) return err(400, 'Duplicate key food ID')
    const ingredientIds = new Set(recipe.ingredients.map((ingredient) => ingredient.food_id))
    if (keyFoodIds.some((id) => !ingredientIds.has(id))) {
      return err(400, 'Key foods must be known foods already used in this recipe')
    }
    if (totalTime !== null && (!Number.isInteger(totalTime) || totalTime <= 0)) {
      return err(400, 'Total time must be a positive number of minutes')
    }
    if (isOwnCreation !== undefined && typeof isOwnCreation !== 'boolean') {
      return err(400, 'is_own_creation must be a boolean')
    }

    recipe.meal_occasions = [...occasions]
    recipe.dish_type = dishType || undefined
    recipe.key_foods = keyFoodIds.map((foodId) => {
      const ingredient = recipe.ingredients.find((item) => item.food_id === foodId)
      return { food_id: foodId, food_name: ingredient.food_name }
    })
    if (isOwnCreation !== undefined) recipe.is_own_creation = isOwnCreation
    recipe.total_time_minutes = totalTime
    recipe.updated_at = new Date().toISOString()
    return json({ ...recipe, is_favourite: seed.favouriteRecipeIds.has(recipe.id) })
  }

  const archiveMatch = pathname.match(/^\/api\/recipes\/(\d+)\/archive$/)
  if (archiveMatch && method === 'PUT') {
    const recipe = recipes.find((item) => item.id === Number(archiveMatch[1]))
    if (!recipe) return err(404, 'Recipe not found')
    if (typeof body?.is_archived !== 'boolean') return err(400, 'is_archived must be a boolean')
    // Flag only: updated_at, the diary rows, favourites and usual portions are untouched.
    recipe.is_archived = body.is_archived
    return json(recipeResponse(recipe))
  }

  const favouriteMatch = pathname.match(/^\/api\/recipes\/(\d+)\/favourite$/)
  if (favouriteMatch && method === 'PUT') {
    const recipeId = Number(favouriteMatch[1])
    if (!recipes.some((recipe) => recipe.id === recipeId)) return err(404, 'Recipe not found')
    if (typeof body?.is_favourite !== 'boolean') return err(400, 'is_favourite must be a boolean')
    if (body.is_favourite) seed.favouriteRecipeIds.add(recipeId)
    else seed.favouriteRecipeIds.delete(recipeId)
    return json({ is_favourite: body.is_favourite })
  }

  if (pathname === '/api/diary' && method === 'POST') {
    const date = body?.date ?? today
    const grams = Number(body?.quantity_grams ?? 100)
    const food = foods.find((f) => String(f.id) === String(body?.food_id))
    const recipe = recipes.find((r) => String(r.id) === String(body?.recipe_id))
    const source = food ?? recipe
    if (!source) return err(400, 'unknown food_id or recipe_id')
    // Decision 59: an archived recipe must be restored before it can be logged again.
    if (recipe?.is_archived) {
      return err(409, 'This recipe is archived. Restore it before adding it to the Diary.')
    }

    // The real Go handler stores the nutrition snapshot sent by the client;
    // it does not re-read the current food/recipe definition. Keep the fixture
    // honest so omitted values surface as zero, just as they do in production.
    const entry = {
      id: Math.max(0, ...seed.diaryEntries.map((e) => e.id)) + 1,
      user_id: 1,
      date,
      meal: body?.meal ?? 'snacks',
      food_id: food ? food.id : null,
      recipe_id: recipe ? recipe.id : null,
      quantity_grams: grams,
      calories: Number(body?.calories ?? 0),
      protein: Number(body?.protein ?? 0),
      carbs: Number(body?.carbs ?? 0),
      fat: Number(body?.fat ?? 0),
      fibre: Number(body?.fibre ?? 0),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...(food ? { food_name: food.name } : { recipe_name: recipe.name }),
    }
    seed.diaryEntries.push(entry)

    // Decision 32: the first successful recipe log becomes that user's usual;
    // later logs are one-off unless the client explicitly asks otherwise.
    if (recipe) seed.rememberRecipePortion(recipe.id, grams, Boolean(body?.make_usual))

    return json(entry, 201)
  }

  if (pathname === '/api/drinks' && method === 'POST') {
    const created = buildDrink(body, seed.nextDrinkId())
    if (created.error) return err(400, created.error)
    seed.drinks.push(created.drink)
    return json(created.drink, 201)
  }

  if (/^\/api\/drinks\/\d+$/.test(pathname) && method === 'PUT') {
    const id = Number.parseInt(pathname.split('/').pop(), 10)
    const existing = seed.findDrink(id)
    if (!existing) return err(404, 'Drink not found')
    const updated = buildDrink(body, id)
    if (updated.error) return err(400, updated.error)
    Object.assign(existing, updated.drink)
    return json(existing)
  }

  if (/^\/api\/drinks\/\d+$/.test(pathname) && method === 'DELETE') {
    const id = Number.parseInt(pathname.split('/').pop(), 10)
    const index = seed.drinks.findIndex((d) => d.id === id)
    if (index === -1) return err(404, 'Drink not found')
    seed.drinks.splice(index, 1)
    return { status: 204, body: '', contentType: 'application/json' }
  }

  if (pathname === '/api/drinks/entries' && method === 'POST') {
    const date = body?.date ?? today
    const drink = seed.findDrink(body?.drink_id)
    if (!drink) return err(404, 'Drink not found')
    const volume = Number(body?.volume_ml) > 0 ? Number(body.volume_ml) : drink.volume_ml
    let calories =
      volume === drink.volume_ml
        ? drink.calories
        : Math.round((drink.calories * volume) / drink.volume_ml)
    if (body?.calories != null && Number.isFinite(Number(body.calories))) {
      calories = Math.max(0, Math.round(Number(body.calories)))
    }
    const entry = {
      id: seed.nextDrinkEntryId(),
      drink_id: drink.id,
      date,
      name: drink.name,
      icon: drink.icon,
      volume_ml: volume,
      calories,
    }
    seed.drinkEntries.push({ ...entry, user_id: 1, created_at: new Date().toISOString() })
    return json(entry, 201)
  }

  if (pathname.startsWith('/api/drinks/entries/') && method === 'DELETE') {
    const id = Number.parseInt(pathname.split('/').pop(), 10)
    const index = seed.drinkEntries.findIndex((e) => e.id === id)
    if (index === -1) return err(404, 'not found')
    seed.drinkEntries.splice(index, 1)
    return json({ success: true })
  }

  // Edit a logged quantity. Mirrors the Go handler: it writes exactly the fields
  // it is given (the client scales them from the entry's own snapshot) and does
  // not re-read the food or recipe definition.
  if (pathname.startsWith('/api/diary/') && method === 'PUT') {
    const id = Number.parseInt(pathname.split('/').pop(), 10)
    const entry = seed.diaryEntries.find((e) => e.id === id)
    if (!entry) return err(404, 'not found')

    for (const key of ['quantity_grams', 'calories', 'protein', 'carbs', 'fat', 'fibre']) {
      const value = body?.[key]
      if (value != null && Number.isFinite(Number(value))) entry[key] = Number(value)
    }
    if (typeof body?.meal === 'string') entry.meal = body.meal
    entry.updated_at = new Date().toISOString()
    return json({ success: true })
  }

  if (pathname.startsWith('/api/diary/') && method === 'DELETE') {
    const id = Number.parseInt(pathname.split('/').pop(), 10)
    const index = seed.diaryEntries.findIndex((e) => e.id === id)
    if (index === -1) return err(404, 'not found')
    seed.diaryEntries.splice(index, 1)
    return json({ success: true })
  }

  if (pathname === '/api/foods' && method === 'POST') {
    const built = buildFoodInput(body)
    if (built.error) return err(400, built.error)
    const food = {
      id: seed.nextFoodId(),
      name: built.name,
      brand: built.brand,
      calories_per_100g: built.calories,
      protein_per_100g: built.protein,
      carbs_per_100g: built.carbs,
      fat_per_100g: built.fat,
      fibre_per_100g: built.fibre,
      serving_name: built.servingName,
      serving_grams: built.servingGrams,
      is_edited: false,
      servings: [],
    }
    applyMeasures(food, built.servings)
    seed.foods.push(food)
    return json(foodResponse(food), 201)
  }

  const foodMatch = pathname.match(/^\/api\/foods\/(\d+)$/)
  if (foodMatch && method === 'PUT') {
    const food = seed.findFood(Number(foodMatch[1]))
    if (!food) return err(404, 'Food not found')
    const built = buildFoodInput(body)
    if (built.error) return err(400, built.error)

    Object.assign(food, {
      name: built.name,
      brand: built.brand,
      calories_per_100g: built.calories,
      protein_per_100g: built.protein,
      carbs_per_100g: built.carbs,
      fat_per_100g: built.fat,
      fibre_per_100g: built.fibre,
      serving_name: built.servingName,
      serving_grams: built.servingGrams,
      is_edited: true,
    })
    // FatSecret-provided measures survive an edit; the household's are replaced.
    food.servings = (food.servings ?? []).filter((serving) => serving.fatsecret_serving_id != null)
    applyMeasures(food, built.servings)
    recalculateRecipesUsingFood(recipes, food.id, foods)
    return json(foodResponse(food))
  }

  if (foodMatch && method === 'DELETE') {
    const index = seed.foods.findIndex((f) => f.id === Number(foodMatch[1]))
    if (index === -1) return err(404, 'Food not found')
    if (seed.foods[index].fatsecret_id != null) return err(403, 'Cannot delete cached FatSecret foods')
    seed.foods.splice(index, 1)
    return { status: 204, body: '', contentType: 'application/json' }
  }

  if (pathname.startsWith('/api/')) {
    return err(501, `Fixture API: ${method} ${pathname} is not implemented in the spike`)
  }

  return null
}

function clampDays(raw, fallback = 14) {
  const parsed = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, 90)
}

function buildDrink(body, id) {
  const name = String(body?.name ?? '').trim()
  const volume = Number(body?.volume_ml)
  if (!name) return { error: 'Drink name is required' }
  if (!Number.isFinite(volume) || volume <= 0) return { error: 'Drink volume_ml must be greater than zero' }
  const sugar = body?.usual_sugar
  return {
    drink: {
      id,
      user_id: 1,
      name,
      icon: String(body?.icon ?? '🥤'),
      volume_ml: volume,
      calories: Math.max(0, Math.round(Number(body?.calories ?? 0))),
      counts_toward_water: Boolean(body?.counts_toward_water),
      accepts_milk: Boolean(body?.accepts_milk),
      accepts_sugar: Boolean(body?.accepts_sugar),
      usual_milk: Boolean(body?.usual_milk),
      usual_sugar: sugar === '1' || sugar === '2' || sugar === 'sweetener' ? sugar : '0',
      sort_order: Number.isFinite(Number(body?.sort_order)) ? Number(body.sort_order) : 0,
    },
  }
}

// A food as JSON: measures are only included when there are any, matching the
// Go struct's `omitempty`.
function foodResponse(food) {
  const servings = (food.servings ?? []).map((serving) => ({ ...serving }))
  return {
    ...food,
    ...(servings.length > 0 ? { servings } : {}),
  }
}

function recipeResponse(recipe) {
  return {
    ...recipe,
    is_favourite: seed.favouriteRecipeIds.has(recipe.id),
    times_logged: seed.diaryEntries.filter(
      (entry) => entry.recipe_id === recipe.id && entry.user_id === seed.user.id,
    ).length,
    usual_grams: seed.usualGramsFor(recipe.id),
  }
}

const MEASURE_ERRORS = {
  blankDescription: 'Every named measure needs a description',
  blankPreferredName: 'Give the preferred serving a name, for example “1 bag”',
  preferredNeedsGrams: 'The preferred serving needs a weight in grams greater than zero',
}

/** Validates a food write, mirroring the Go handler's rules. Returns numbers, not strings. */
function buildFoodInput(body) {
  const name = String(body?.name ?? '').trim()
  if (!name) return { error: 'Name is required' }

  const number = (value, fallback = 0) => {
    if (value === undefined || value === null || value === '') return fallback
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : Number.NaN
  }

  const calories = number(body?.calories_per_100g)
  const macros = ['protein_per_100g', 'carbs_per_100g', 'fat_per_100g', 'fibre_per_100g'].map((key) =>
    number(body?.[key]),
  )
  if (!Number.isFinite(calories) || calories < 0 || macros.some((value) => !Number.isFinite(value) || value < 0)) {
    return { error: 'Nutrition values must be zero or more' }
  }

  const servingName = String(body?.serving_name ?? '').trim()
  const servingGrams = number(body?.serving_grams, Number.NaN)
  if (servingName && !(servingGrams > 0)) return { error: MEASURE_ERRORS.preferredNeedsGrams }
  if (!servingName && servingGrams > 0) return { error: MEASURE_ERRORS.blankPreferredName }

  const servings = []
  const seen = new Set()
  for (const serving of body?.servings ?? []) {
    const description = String(serving?.description ?? '').trim()
    if (!description) return { error: MEASURE_ERRORS.blankDescription }
    const grams = number(serving?.grams, Number.NaN)
    if (!(grams > 0)) {
      return { error: `The measure "${description}" needs a weight in grams greater than zero` }
    }
    if (seen.has(description.toLowerCase())) return { error: `Duplicate named measure: ${description}` }
    seen.add(description.toLowerCase())
    servings.push({ description, grams })
  }
  if (servings.length > 20) return { error: 'A food can have at most 20 named measures' }

  return {
    name,
    brand: String(body?.brand ?? '').trim(),
    calories,
    protein: macros[0],
    carbs: macros[1],
    fat: macros[2],
    fibre: macros[3],
    servingName,
    servingGrams: Number.isNaN(servingGrams) ? 0 : servingGrams,
    servings,
  }
}

function applyMeasures(food, servings) {
  for (const serving of servings) {
    food.servings.push({
      id: seed.nextFoodServingId(),
      food_id: food.id,
      description: serving.description,
      grams: serving.grams,
    })
  }
}

const json = (body, status = 200) => ({ status, body, contentType: 'application/json' })
const err = (status, message) => json({ error: message }, status)

export { TODAY, drinkEntries }
