/**
 * SPIKE fixture data — mirrors the shape of the real cals SQLite tables
 * (see internal/database/migrations.go) and internal/models/models.go.
 *
 * Everything is generated deterministically from "today", so the demo always
 * looks like a live, in-progress food diary rather than a frozen snapshot.
 */

const DAY_MS = 24 * 60 * 60 * 1000

function localNoon(daysAgo = 0) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setTime(d.getTime() - daysAgo * DAY_MS)
  return d
}

export const iso = (d) => d.toISOString().slice(0, 10)
export const TODAY = iso(localNoon(0))

const round1 = (n) => Math.round(n * 10) / 10

// ---------------------------------------------------------------------------
// Foods (per 100 g, exactly as stored by cals)
// ---------------------------------------------------------------------------

const FOOD_ROWS = [
  // id, name, brand, kcal, protein, carbs, fat, fibre, serving_name, serving_grams, fatsecret_id
  [1, 'Porridge Oats', '', 379, 13.2, 67.7, 6.5, 10.1, '40g portion', 40, 'fs_1001'],
  [2, 'Semi-Skimmed Milk', '', 47, 3.4, 4.8, 1.7, 0, '200ml glass', 206, null],
  [3, 'Greek Yogurt 0%', '', 57, 10.2, 4.0, 0.4, 0, '170g pot', 170, 'fs_1002'],
  [4, 'Blueberries', '', 57, 0.7, 14.5, 0.3, 2.4, '80g handful', 80, null],
  [5, 'Chicken Breast, grilled', '', 165, 31.0, 0, 3.6, 0, 'Large breast', 180, 'fs_1003'],
  [6, 'Wholemeal Bread', 'Hovis', 247, 13.0, 41.0, 3.4, 7.0, '1 slice', 44, 'fs_1004'],
  [7, 'Butter', '', 717, 0.9, 0.1, 81.1, 0, '10g', 10, null],
  [8, 'Eggs, boiled', '', 155, 13.0, 1.1, 11.0, 0, '1 medium egg', 58, null],
  [9, 'Basmati Rice, cooked', '', 130, 2.7, 28.2, 0.3, 0.4, '180g portion', 180, 'fs_1005'],
  [10, 'Broccoli, steamed', '', 34, 2.8, 7.0, 0.4, 2.6, '80g portion', 80, null],
  [11, 'Salmon Fillet, baked', '', 208, 20.4, 0, 13.4, 0, '140g fillet', 140, 'fs_1006'],
  [12, 'Olive Oil', '', 884, 0, 0, 100, 0, '1 tbsp', 13.5, null],
  [13, 'Dark Chocolate 70%', 'Lindt', 598, 7.8, 45.9, 42.6, 10.9, '2 squares', 20, 'fs_1007'],
  [14, 'Banana', '', 89, 1.1, 22.8, 0.3, 2.6, '1 medium', 118, null],
  [15, 'Cheddar Cheese', '', 416, 25.0, 1.3, 34.9, 0, '30g', 30, 'fs_1008'],
  [16, 'Baked Beans', 'Heinz', 78, 4.7, 13.0, 0.4, 4.7, 'Half tin', 200, 'fs_1009'],
  [17, 'Crisps, ready salted', 'Walkers', 527, 6.0, 52.6, 30.8, 4.4, '25g bag', 25, 'fs_1010'],
  [18, 'Black Coffee', '', 2, 0.1, 0, 0, 0, 'Mug', 250, null],
  [19, 'Lager, 4%', '', 42, 0.5, 3.6, 0, 0, 'Pint', 568, null],
  [20, 'Houmus', 'Sainsbury’s', 269, 7.6, 11.0, 21.0, 4.5, '50g', 50, 'fs_1011'],
  [21, 'Fish & Chips, takeaway', '', 232, 12.0, 25.0, 10.0, 2.0, 'Regular portion', 400, 'fs_1012'],
  [22, 'Naan Bread', '', 310, 8.7, 50.0, 7.6, 2.2, '1 naan', 90, 'fs_1013'],
  [23, 'Chicken Tikka Masala, takeaway', '', 130, 9.5, 6.0, 7.2, 1.0, 'Portion', 400, 'fs_1014'],
  [24, 'Roast Potatoes', '', 149, 2.6, 26.0, 4.0, 2.0, '200g', 200, null],
  [25, 'Mushrooms, sliced', '', 22, 3.1, 0.4, 0.5, 1.0, '80g handful', 80, null],
]

// Extra named gram-backed measures (Phase 13), keyed by food id. The preferred
// serving above stays the first choice; these follow it. Grams stay canonical.
const EXTRA_MEASURES = {
  1: [['30 g scoop', 30]],              // Porridge Oats
  6: [['1 thick slice', 60]],           // Wholemeal Bread
  14: [['1 large', 150]],               // Banana
  17: [['2 bags', 50]],                 // Crisps, ready salted
}

let servingId = 1

export const foods = FOOD_ROWS.map(
  ([id, name, brand, cal, protein, carbs, fat, fibre, servingName, servingGrams, fsId]) => {
    const servings = []
    if (servingName) {
      servings.push({ id: servingId++, food_id: id, description: servingName, grams: servingGrams })
    }
    for (const [description, grams] of EXTRA_MEASURES[id] ?? []) {
      servings.push({ id: servingId++, food_id: id, description, grams })
    }
    return {
      id,
      // Go structs use `omitempty`, so absent values are omitted rather than null.
      fatsecret_id: fsId ?? undefined,
      name,
      brand: brand || undefined,
      calories_per_100g: cal,
      protein_per_100g: protein,
      carbs_per_100g: carbs,
      fat_per_100g: fat,
      fibre_per_100g: fibre,
      serving_name: servingName,
      serving_grams: servingGrams,
      is_edited: fsId === null,
      servings,
    }
  },
)

let foodIdSeq = Math.max(0, ...foods.map((f) => f.id))

export function nextFoodId() {
  foodIdSeq += 1
  return foodIdSeq
}

let foodServingIdSeq = servingId

export function nextFoodServingId() {
  foodServingIdSeq += 1
  return foodServingIdSeq
}

export function findFood(id) {
  return foods.find((f) => String(f.id) === String(id))
}

/**
 * A diary entry's food measures, read from the food definition at response
 * time exactly as the Go GET /api/diary handler does.
 */
export function foodMeasuresFor(foodId) {
  const food = findFood(foodId)
  if (!food) return {}
  const servings = (food.servings ?? []).map((serving) => ({ ...serving }))
  return {
    ...(food.serving_name ? { food_serving_name: food.serving_name } : {}),
    ...(food.serving_grams ? { food_serving_grams: food.serving_grams } : {}),
    ...(servings.length > 0 ? { food_servings: servings } : {}),
  }
}

const foodById = new Map(foods.map((f) => [f.id, f]))

// ---------------------------------------------------------------------------
// Recipes (weight-reduction maths mirrors internal/handlers/recipes.go)
// ---------------------------------------------------------------------------

function buildRecipe({
  id,
  name,
  description,
  instructions,
  serves,
  items,
  text,
  cookedWeight,
  mealOccasions = [],
  dishType = '',
  keyFoodIds = [],
  totalTimeMinutes = null,
}) {
  const ingredients = items.map(([foodId, grams], i) => {
    const f = foodById.get(foodId)
    return {
      id: id * 100 + i,
      recipe_id: id,
      food_id: foodId,
      food_name: f.name,
      quantity_grams: grams,
      calories: round1((f.calories_per_100g * grams) / 100),
      sort_order: i,
    }
  })

  const sum = (key) =>
    round1(ingredients.reduce((acc, ing) => {
      const f = foodById.get(ing.food_id)
      return acc + (f[key] * ing.quantity_grams) / 100
    }, 0))

  const calculated = round1(items.reduce((acc, [, g]) => acc + g, 0))
  const totals = {
    calories: sum('calories_per_100g'),
    protein: sum('protein_per_100g'),
    carbs: sum('carbs_per_100g'),
    fat: sum('fat_per_100g'),
    fibre: sum('fibre_per_100g'),
  }
  const totalWeight = cookedWeight ?? calculated
  const per100 = (v) => round1((v / totalWeight) * 100)

  return {
    id,
    name,
    description,
    instructions,
    image_filename: '',
    serves,
    meal_occasions: [...mealOccasions],
    dish_type: dishType || undefined,
    key_foods: keyFoodIds.map((foodId) => ({ food_id: foodId, food_name: foodById.get(foodId).name })),
    total_time_minutes: totalTimeMinutes,
    created_by_user_id: 1,
    created_by_name: 'Dougal',
    calculated_weight_grams: calculated,
    total_weight_grams: totalWeight,
    weight_is_manual: cookedWeight != null && cookedWeight !== calculated,
    total_calories: totals.calories,
    total_protein: totals.protein,
    total_carbs: totals.carbs,
    total_fat: totals.fat,
    total_fibre: totals.fibre,
    calories_per_100g: per100(totals.calories),
    protein_per_100g: per100(totals.protein),
    carbs_per_100g: per100(totals.carbs),
    fat_per_100g: per100(totals.fat),
    fibre_per_100g: per100(totals.fibre),
    created_at: `${iso(localNoon(40))}T18:20:00Z`,
    updated_at: `${iso(localNoon(12))}T19:05:00Z`,
    is_archived: false,
    ingredients,
    text_ingredients: (text ?? []).map((description, i) => ({
      id: id * 100 + 90 + i,
      recipe_id: id,
      description,
      sort_order: i,
    })),
  }
}

export const recipes = [
  buildRecipe({
    id: 1,
    name: 'Chicken Curry',
    description: 'Batch-cooked Friday curry. Freezes well.',
    instructions: 'Fry the onion, brown the chicken, add spices and simmer 25 min.',
    serves: 4,
    items: [[5, 600], [9, 400], [12, 15], [10, 200]],
    text: ['2 tsp curry powder', '1 onion', '2 cloves garlic'],
    cookedWeight: 1050,
    mealOccasions: ['lunch', 'dinner'],
    dishType: 'main',
    keyFoodIds: [5, 9],
    totalTimeMinutes: 60,
  }),
  buildRecipe({
    id: 2,
    name: 'Porridge & Berries',
    description: 'Weekday breakfast.',
    instructions: 'Simmer oats in milk, top with berries.',
    serves: 1,
    items: [[1, 60], [2, 200], [4, 80]],
    cookedWeight: 340,
    mealOccasions: ['breakfast'],
    keyFoodIds: [1, 4],
    totalTimeMinutes: 10,
  }),
  buildRecipe({
    id: 3,
    name: 'Salmon Traybake',
    description: 'One tray, 25 minutes.',
    instructions: 'Roast salmon and broccoli, serve over rice.',
    serves: 2,
    items: [[11, 280], [9, 300], [10, 200], [12, 10]],
    cookedWeight: 780,
    mealOccasions: ['dinner'],
    dishType: 'main',
    keyFoodIds: [11],
    totalTimeMinutes: 25,
  }),
  buildRecipe({
    id: 4,
    name: 'Chicken & Mushroom Pie',
    description: 'Sunday pie, shop-bought pastry.',
    instructions: 'Brown the chicken, soften the mushrooms, add flour and milk, top with pastry and bake 30 min.',
    serves: 4,
    items: [[5, 700], [25, 300], [12, 15], [2, 100]],
    text: ['1 sheet puff pastry', '2 tbsp plain flour'],
    cookedWeight: 1000,
    mealOccasions: ['dinner'],
    dishType: 'main',
    keyFoodIds: [5, 25],
    totalTimeMinutes: 75,
  }),
]

// In-memory, signed-in-user favourite state for the fixture API.
export const favouriteRecipeIds = new Set()

// Per-user usual recipe portions (user 1 is the signed-in fixture user).
// Seeded for one recipe so the preview shows the "usual already saved" state as
// well as the first-log state.
export const recipePortions = new Map([[3, 390]])

export function usualGramsFor(recipeId) {
  return recipePortions.has(recipeId) ? recipePortions.get(recipeId) : null
}

export function rememberRecipePortion(recipeId, grams, makeUsual) {
  if (!(grams > 0)) return
  if (makeUsual) {
    recipePortions.set(recipeId, grams)
    return
  }
  if (!recipePortions.has(recipeId)) recipePortions.set(recipeId, grams)
}

const recipeById = new Map(recipes.map((r) => [r.id, r]))

// ---------------------------------------------------------------------------
// Diary — 21 days of realistic eating, with today deliberately part-filled
// ---------------------------------------------------------------------------

let entryId = 1

/**
 * Deterministic ±12% portion jitter, so the diary looks like a real person's
 * rather than the same three days on repeat. Seeded from the day offset and
 * the time string, so it is stable across reloads.
 */
function jitter(date, at, salt = 0) {
  const seedValue = (Date.parse(`${date}T00:00:00Z`) / 86_400_000 + at.length * 7 + salt * 13) | 0
  const x = Math.sin(seedValue * 12.9898) * 43758.5453
  return 1 + (x - Math.floor(x) - 0.5) * 0.24
}

function makeEntry(date, meal, foodId, grams, at = '08:15', jitterSalt = 0) {
  const f = foodById.get(foodId)
  grams = Math.max(5, Math.round((grams * jitter(date, at, jitterSalt + foodId)) / 5) * 5)
  const k = grams / 100
  return {
    id: entryId++,
    user_id: 1,
    date,
    meal,
    food_id: foodId,
    recipe_id: null,
    quantity_grams: grams,
    calories: round1(f.calories_per_100g * k),
    protein: round1(f.protein_per_100g * k),
    carbs: round1(f.carbs_per_100g * k),
    fat: round1(f.fat_per_100g * k),
    fibre: round1(f.fibre_per_100g * k),
    created_at: `${date}T${at}:00Z`,
    updated_at: `${date}T${at}:00Z`,
    food_name: f.name,
  }
}

function makeRecipeEntry(date, meal, recipeId, grams, at = '18:45') {
  const r = recipeById.get(recipeId)
  const k = grams / 100
  return {
    id: entryId++,
    user_id: 1,
    date,
    meal,
    food_id: null,
    recipe_id: recipeId,
    quantity_grams: grams,
    calories: round1(r.calories_per_100g * k),
    protein: round1(r.protein_per_100g * k),
    carbs: round1(r.carbs_per_100g * k),
    fat: round1(r.fat_per_100g * k),
    fibre: round1(r.fibre_per_100g * k),
    created_at: `${date}T${at}:00Z`,
    updated_at: `${date}T${at}:00Z`,
    recipe_name: r.name,
  }
}

const BREAKFASTS = [
  (d) => [makeEntry(d, 'breakfast', 1, 60, '07:20'), makeEntry(d, 'breakfast', 2, 200, '07:22'), makeEntry(d, 'breakfast', 4, 80, '07:24')],
  (d) => [makeEntry(d, 'breakfast', 6, 88, '07:35'), makeEntry(d, 'breakfast', 7, 10, '07:36'), makeEntry(d, 'breakfast', 8, 116, '07:40')],
  (d) => [makeEntry(d, 'breakfast', 3, 200, '07:15'), makeEntry(d, 'breakfast', 4, 80, '07:18'), makeEntry(d, 'breakfast', 14, 118, '07:20')],
]

const LUNCHES = [
  (d) => [makeEntry(d, 'lunch', 5, 150, '12:40'), makeEntry(d, 'lunch', 9, 200, '12:42'), makeEntry(d, 'lunch', 10, 80, '12:44')],
  (d) => [makeEntry(d, 'lunch', 6, 88, '12:30'), makeEntry(d, 'lunch', 15, 40, '12:32'), makeEntry(d, 'lunch', 17, 25, '12:35')],
  (d) => [makeEntry(d, 'lunch', 11, 140, '13:05'), makeEntry(d, 'lunch', 9, 180, '13:06'), makeEntry(d, 'lunch', 10, 80, '13:07')],
]

const DINNERS = [
  (d) => [makeRecipeEntry(d, 'dinner', 1, 400, '18:30')],
  (d) => [makeEntry(d, 'dinner', 11, 140, '19:10'), makeEntry(d, 'dinner', 9, 180, '19:12'), makeEntry(d, 'dinner', 10, 80, '19:14')],
  (d) => [makeEntry(d, 'dinner', 5, 180, '18:50'), makeEntry(d, 'dinner', 16, 200, '18:52'), makeEntry(d, 'dinner', 6, 44, '18:55')],
]

const SNACKS = [
  (d) => [
    makeEntry(d, 'snacks', 14, 118, '15:30'),
    makeEntry(d, 'snacks', 13, 20, '20:30'),
    makeEntry(d, 'snacks', 3, 150, '21:00'),
  ],
  (d) => [
    makeEntry(d, 'snacks', 3, 170, '15:10'),
    makeEntry(d, 'snacks', 4, 60, '15:12'),
    makeEntry(d, 'snacks', 14, 118, '20:45'),
  ],
  (d) => [
    makeEntry(d, 'snacks', 17, 25, '16:00'),
    makeEntry(d, 'snacks', 20, 50, '16:05'),
    makeEntry(d, 'snacks', 3, 150, '21:00'),
  ],
]

export const diaryEntries = []

/** Friday takeaway, Saturday curry night, Sunday roast: the days that go over. */
function specialDinner(date) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
  if (weekday === 5) return [makeEntry(date, 'dinner', 21, 400, '19:20')]
  if (weekday === 6) {
    return [
      makeEntry(date, 'dinner', 23, 400, '19:40'),
      makeEntry(date, 'dinner', 22, 90, '19:42'),
      makeEntry(date, 'dinner', 9, 200, '19:44'),
    ]
  }
  if (weekday === 0) {
    return [
      makeEntry(date, 'dinner', 5, 200, '18:20'),
      makeEntry(date, 'dinner', 24, 200, '18:22'),
      makeEntry(date, 'dinner', 10, 100, '18:24'),
    ]
  }
  return null
}

// Days 21 → 1: complete days. Day 0 (today): breakfast + lunch + a snack,
// dinner still to come.
for (let back = 21; back >= 0; back--) {
  const date = iso(localNoon(back))
  const variant = (back + 3) % 3

  diaryEntries.push(...BREAKFASTS[variant](date))
  diaryEntries.push(...LUNCHES[variant](date))
  if (back > 0) diaryEntries.push(...(specialDinner(date) ?? DINNERS[variant](date)))
  SNACKS[variant](date)
    .slice(0, back === 0 ? 1 : 3)
    .forEach((e) => diaryEntries.push(e))
}

// ---------------------------------------------------------------------------
// Drinks
// ---------------------------------------------------------------------------

function drinkRow(row) {
  return {
    accepts_milk: false,
    accepts_sugar: false,
    usual_milk: false,
    usual_sugar: '0',
    sort_order: 0,
    ...row,
  }
}

export const drinks = [
  drinkRow({
    id: 1, user_id: 1, name: 'Tea', icon: '🫖', volume_ml: 250, calories: 17,
    counts_toward_water: true, accepts_milk: true, accepts_sugar: true,
    usual_milk: true, usual_sugar: '0', sort_order: 1,
  }),
  drinkRow({
    id: 2, user_id: 1, name: 'Coffee', icon: '☕', volume_ml: 250, calories: 2,
    counts_toward_water: true, accepts_milk: true, accepts_sugar: true,
    usual_milk: false, usual_sugar: '0', sort_order: 2,
  }),
  drinkRow({
    id: 3, user_id: 1, name: 'Water', icon: '💧', volume_ml: 250, calories: 0,
    counts_toward_water: true, sort_order: 0,
  }),
  drinkRow({
    id: 4, user_id: 1, name: 'Beer', icon: '🍺', volume_ml: 330, calories: 140,
    counts_toward_water: false, sort_order: 5,
  }),
  drinkRow({
    id: 5, user_id: 1, name: 'Milk', icon: '🥛', volume_ml: 200, calories: 94,
    counts_toward_water: false, sort_order: 3,
  }),
  drinkRow({
    id: 6, user_id: 1, name: 'Juice', icon: '🧃', volume_ml: 200, calories: 90,
    counts_toward_water: false, sort_order: 4,
  }),
  drinkRow({
    id: 7, user_id: 1, name: 'Wine', icon: '🍷', volume_ml: 175, calories: 160,
    counts_toward_water: false, sort_order: 6,
  }),
]

export const drinkEntries = []
let drinkEntryId = 1

/** Used by the fixture API's write endpoints. */
export function nextDrinkEntryId() {
  return ++drinkEntryId
}

export function findDrink(id) {
  return drinks.find((d) => String(d.id) === String(id))
}

let drinkIdSeq = Math.max(0, ...drinks.map((d) => d.id))

export function nextDrinkId() {
  drinkIdSeq += 1
  return drinkIdSeq
}

function addDrink(date, drinkId, count, at = '08:00', volumeOverride) {
  const drink = drinks.find((d) => d.id === drinkId)
  for (let i = 0; i < count; i++) {
    const volume = volumeOverride ?? drink.volume_ml
    const calories =
      volume === drink.volume_ml
        ? drink.calories
        : Math.round((drink.calories * volume) / drink.volume_ml)
    drinkEntries.push({
      id: drinkEntryId++,
      user_id: 1,
      drink_id: drink.id,
      date,
      created_at: `${date}T${at}:00Z`,
      name: drink.name,
      icon: drink.icon,
      volume_ml: volume,
      calories,
    })
  }
}

for (let back = 21; back >= 0; back--) {
  const date = iso(localNoon(back))
  const weekday = localNoon(back).getDay()
  addDrink(date, 1, 1, '07:20') // morning tea
  addDrink(date, 2, 2, '07:30') // two coffees
  addDrink(date, 3, 2, '10:00') // two glasses of water
  addDrink(date, 1, 1, '15:00') // afternoon tea
  addDrink(date, 3, 1, '16:30') // another water
  if (weekday === 5 || weekday === 6) addDrink(date, 4, 2, '19:30') // weekend pints
  if (back === 0) addDrink(date, 2, 1, '13:10')
}

// ---------------------------------------------------------------------------
// Weight, measurements, settings
// ---------------------------------------------------------------------------

export const weightEntries = []
let weightId = 1

for (let back = 119; back >= 0; back--) {
  const d = localNoon(back)
  const weekday = d.getDay()
  // Weigh most mornings; skip Wednesdays and the odd day for realism.
  if (weekday === 3 || (back % 11 === 0 && back !== 0)) continue

  const trend = 95.4 - (119 - back) * 0.0485
  const wobble = Math.sin((119 - back) / 8.5) * 0.32 + Math.cos((119 - back) / 3.1) * 0.12
  const weight = Math.round((trend + wobble) * 10) / 10

  weightEntries.push({
    id: weightId++,
    user_id: 1,
    date: iso(d),
    weight_kg: weight,
    created_at: `${iso(d)}T07:05:00Z`,
  })
}

export const measurements = [
  { id: 1, user_id: 1, date: iso(localNoon(84)), waist_cm: 104.5, chest_cm: 110.2, hips_cm: 106.0, neck_cm: 41.0, created_at: `${iso(localNoon(84))}T07:10:00Z` },
  { id: 2, user_id: 1, date: iso(localNoon(63)), waist_cm: 102.8, chest_cm: 109.4, hips_cm: 105.1, neck_cm: 40.6, created_at: `${iso(localNoon(63))}T07:10:00Z` },
  { id: 3, user_id: 1, date: iso(localNoon(42)), waist_cm: 101.0, chest_cm: 108.8, hips_cm: 104.2, neck_cm: 40.3, created_at: `${iso(localNoon(42))}T07:10:00Z` },
  { id: 4, user_id: 1, date: iso(localNoon(21)), waist_cm: 99.4, chest_cm: 108.0, hips_cm: 103.4, neck_cm: 40.0, created_at: `${iso(localNoon(21))}T07:10:00Z` },
  { id: 5, user_id: 1, date: iso(localNoon(3)), waist_cm: 98.2, chest_cm: 107.4, hips_cm: 102.8, neck_cm: 39.8, created_at: `${iso(localNoon(3))}T07:10:00Z` },
]

export const nutritionSettings = {
  protein_goal_per_kg: 1.6,
  fibre_goal: 30,
  fat_max_percent: 35,
  carb_min_percent: 45,
  carb_max_percent: 65,
}

export const user = {
  id: 1,
  email: 'dougal@duncandoes.uk',
  name: 'Dougal',
  daily_calorie_goal: 2000,
  daily_water_goal_ml: 2000,
  weight_unit: 'stones',
  // Matches the start of the seeded diary history, so the bank figure is
  // meaningful rather than crediting days that have no logged food.
  bank_start_date: iso(localNoon(20)),
  target_weight_kg: 85,
  created_at: '2025-02-14T09:00:00Z',
  updated_at: `${TODAY}T07:00:00Z`,
}

// ---------------------------------------------------------------------------
// Derived helpers used by the fixture API
// ---------------------------------------------------------------------------

export function entriesFor(date) {
  return diaryEntries
    .filter((e) => e.date === date)
    .sort((a, b) => {
      const order = { breakfast: 1, lunch: 2, dinner: 3, snacks: 4 }
      return order[a.meal] - order[b.meal] || a.created_at.localeCompare(b.created_at)
    })
}

export function totalsFor(date) {
  return entriesFor(date).reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      protein: acc.protein + e.protein,
      carbs: acc.carbs + e.carbs,
      fat: acc.fat + e.fat,
      fibre: acc.fibre + e.fibre,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 },
  )
}

export function drinkEntriesFor(date) {
  return drinkEntries.filter((e) => e.date === date)
}

export function caloriesBetween(startDate, endDateExclusive) {
  return round1(
    diaryEntries
      .filter((e) => e.date >= startDate && e.date < endDateExclusive)
      .reduce((acc, e) => acc + e.calories, 0),
  )
}

export function drinkCaloriesBetween(startDate, endDateExclusive) {
  return round1(
    drinkEntries
      .filter((e) => e.date >= startDate && e.date < endDateExclusive)
      .reduce((acc, e) => acc + e.calories, 0),
  )
}

export function waterFor(date) {
  const waterDrinkIds = new Set(drinks.filter((d) => d.counts_toward_water).map((d) => d.id))
  const entries = drinkEntries.filter((e) => e.date === date && waterDrinkIds.has(e.drink_id))
  return {
    date,
    consumed_ml: entries.reduce((acc, e) => acc + e.volume_ml, 0),
    target_ml: user.daily_water_goal_ml,
    entries,
  }
}

export function daysBetween(startDate, endDate) {
  const a = Date.parse(`${startDate}T00:00:00Z`)
  const b = Date.parse(`${endDate}T00:00:00Z`)
  return Math.round((b - a) / DAY_MS)
}

export function dateOffset(daysAgo) {
  return iso(localNoon(daysAgo))
}

// ---------------------------------------------------------------------------
// Test/dev helper: restore seeded mutable data after mutations, so tests are
// deterministic and the preview can be reset without a restart.
// ---------------------------------------------------------------------------
const initialDiaryEntries = diaryEntries.slice()
const initialDrinkEntries = drinkEntries.map((e) => ({ ...e }))
const initialDrinks = drinks.map((d) => ({ ...d }))
const initialRecipeContent = new Map(recipes.map((recipe) => [
  recipe.id,
  JSON.parse(JSON.stringify(recipe)),
]))
const initialFavouriteRecipeIds = [...favouriteRecipeIds]
const initialRecipePortions = new Map(recipePortions)
const initialFoods = foods.map((food) => ({
  ...food,
  servings: food.servings.map((serving) => ({ ...serving })),
}))
const initialDiaryEntriesDeep = diaryEntries.map((e) => ({ ...e }))
const initialDrinkEntryId = drinkEntryId
const initialDrinkIdSeq = drinkIdSeq
const initialFoodIdSeq = foodIdSeq
const initialFoodServingIdSeq = foodServingIdSeq

export function resetFixtures() {
  diaryEntries.length = 0
  diaryEntries.push(...initialDiaryEntriesDeep.map((e) => ({ ...e })))
  drinkEntries.length = 0
  drinkEntries.push(...initialDrinkEntries.map((e) => ({ ...e })))
  drinks.length = 0
  drinks.push(...initialDrinks.map((d) => ({ ...d })))
  favouriteRecipeIds.clear()
  for (const recipeId of initialFavouriteRecipeIds) favouriteRecipeIds.add(recipeId)
  recipePortions.clear()
  for (const [recipeId, grams] of initialRecipePortions) recipePortions.set(recipeId, grams)
  foods.length = 0
  foods.push(...initialFoods.map((food) => ({
    ...food,
    servings: food.servings.map((serving) => ({ ...serving })),
  })))
  for (const recipe of recipes) {
    const initial = initialRecipeContent.get(recipe.id)
    Object.assign(recipe, JSON.parse(JSON.stringify(initial)))
  }
  drinkEntryId = initialDrinkEntryId
  drinkIdSeq = initialDrinkIdSeq
  foodIdSeq = initialFoodIdSeq
  foodServingIdSeq = initialFoodServingIdSeq
}
