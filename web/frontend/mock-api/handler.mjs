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
 *          /api/bank, /api/calendar, /api/drinks, /api/weight,
 *          /api/measurements (+ GET latest, POST merge, PUT/DELETE by id),
 *          /api/stats/calories, /api/stats/bank, /api/nutrition/*
 * Supported mutations include Diary/drink demos, recipe create/content/favourite/metadata/archive
 * edits, uncropped photo upload/replacement, and dependent nutrition refreshes. Unsupported
 * mutations (including photo cropping) return 501 with a clear message.
 */

import * as seed from './seed.mjs'
import { buildNewRecipe, buildRecipeContentUpdate, recalculateRecipesUsingFood } from './recipe-content.mjs'

const {
  foods, recipes, drinks, drinkEntries, weightEntries, measurements,
  nutritionSettings, users, user, TODAY,
} = seed

// The acting account for the request in flight. The Admin acting-user switch
// (decisions 45 and 88) stores the chosen account id in a cookie, exactly as
// the Go server does; everything below reads this rather than assuming the
// primary fixture identity.
let actingUserId = 1

const currentUser = () => users.find((candidate) => candidate.id === actingUserId) ?? user

function readActingUserId(headers) {
  const cookieHeader = headers?.cookie ?? headers?.Cookie
  if (typeof cookieHeader !== 'string') return 1
  const cookies = cookieHeader.split(';').map((part) => part.trim())
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.split('=')
    if (name === 'cals_acting_user') {
      const id = Number.parseInt(rest.join('='), 10)
      if (Number.isFinite(id) && id > 0) return id
    }
  }
  return 1
}

const round1 = (n) => Math.round(n * 10) / 10
const num = (v) => (Number.isFinite(v) ? round1(v) : 0)
let recipeImageVersionSeq = 0

// ---------------------------------------------------------------------------
// Bank maths — mirrors internal/handlers/bank.go so the numbers agree
// (decisions 42, 66, 91, 92)
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000

const shiftIsoDate = (isoDate, days) =>
  new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)

// Go's math.Round rounds halves away from zero; Math.round rounds halves towards
// +Infinity, so a −0.5 balance would round differently on the two sides.
const roundHalfAwayFromZero = (n) => (n < 0 ? -Math.round(-n) : Math.round(n))

// The first day that can contribute for an as-of date: the previous N completed
// calendar days, as-of excluded and floored at the bank's start date. Null when
// there is no window at all. Mirrors bankWindow.windowStartDate in bank.go.
function bankWindowStart(asOfDate, startDate, windowDays) {
  if (!startDate || asOfDate <= startDate) return null
  if (windowDays > 0) {
    const limit = shiftIsoDate(asOfDate, -windowDays)
    return limit > startDate ? limit : startDate
  }
  return startDate
}

function bank(asOfDate) {
  const account = currentUser()
  const dailyGoal = account.daily_calorie_goal
  const startDate = account.bank_start_date
  const windowDays = account.bank_window_days ?? 14

  const response = {
    daily_goal: dailyGoal,
    bank_balance: 0,
    today_available: dailyGoal,
    start_date: startDate,
    as_of_date: asOfDate,
    window_days: windowDays,
    window_start_date: '',
    days_counted: 0,
    days_unlogged: 0,
  }

  const windowStart = bankWindowStart(asOfDate, startDate, windowDays)
  if (!windowStart) {
    // An as-of date on the bank's first day still names the window's start; an
    // account with no bank started has no window to name.
    if (startDate && asOfDate <= startDate) response.window_start_date = startDate
    return response
  }
  response.window_start_date = windowStart

  // Decision 42: only days that have logging contribute; a day with no entries
  // at all adds neither the day's budget nor its spend. Food and drinks share
  // one ledger per day (decision 1).
  const lastDay = shiftIsoDate(asOfDate, -1)
  const totals = seed.loggedDayTotals(windowStart, lastDay, actingUserId)
  let consumed = 0
  for (const kcal of totals.values()) {
    response.days_counted += 1
    consumed += kcal
  }
  response.days_unlogged = seed.daysBetween(windowStart, asOfDate) - response.days_counted
  response.bank_balance = roundHalfAwayFromZero(response.days_counted * dailyGoal - consumed)
  response.today_available = dailyGoal + response.bank_balance
  return response
}

// ---------------------------------------------------------------------------
// Nutrition analysis — mirrors internal/handlers/nutrition.go
// ---------------------------------------------------------------------------

function nutritionAnalysis(days = 7) {
  return nutritionAnalysisRange(seed.dateOffset(days - 1), seed.TODAY)
}

// The same analysis over an explicit inclusive range — the weekly report's
// date-range picker (slice 14.6). The Go handler shares resolveSeriesRange
// with the metrics series endpoints, so from/to is strict there; here the
// caller has already validated the range.
function nutritionAnalysisRange(from, to) {
  const daily = []
  let daysWithData = 0

  for (let date = from; date <= to; date = seed.nextDate(date)) {
    const t = seed.totalsFor(date)
    const drinkCal = seed.drinkEntriesFor(date).reduce((acc, e) => acc + e.calories, 0)
    const totalCal = t.calories + drinkCal
    const proteinKcal = t.protein * 4
    const carbsKcal = t.carbs * 4
    const fatKcal = t.fat * 9
    const macroKcal = proteinKcal + carbsKcal + fatKcal

    const kg = currentWeightKg()
    daily.push({
      date,
      calories: num(totalCal),
      food_calories: num(t.calories),
      drink_calories: num(drinkCal),
      protein: num(t.protein),
      carbs: num(t.carbs),
      fat: num(t.fat),
      fibre: num(t.fibre),
      protein_percent: macroKcal ? num((proteinKcal / macroKcal) * 100) : 0,
      carbs_percent: macroKcal ? num((carbsKcal / macroKcal) * 100) : 0,
      fat_percent: macroKcal ? num((fatKcal / macroKcal) * 100) : 0,
      protein_per_kg: kg ? num(t.protein / kg) : 0,
    })
    if (totalCal > 0) daysWithData++
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
  const latest = weightEntries
    .filter((entry) => entry.user_id === actingUserId)
    .sort((a, b) => b.date.localeCompare(a.date))[0]
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

export function handle(method, url, body, headers = {}) {
  const { pathname, searchParams } = url
  const today = seed.TODAY
  actingUserId = readActingUserId(headers)

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
  if (pathname === '/api/users/me' && method === 'GET') return json(currentUser())

  // PUT /api/users/me — bank_window_days is the slice-14.2 addition (decision
  // 93) and weight_trend_days the slice-14.3 one (decision 95). 0 means "all
  // time" for the bank; the trend window must be something the chart could
  // actually draw (3–90 weigh-ins). Anything else is a 400 rather than a
  // silent no-op, matching internal/handlers/users.go.
  if (pathname === '/api/users/me' && method === 'PUT') {
    const account = currentUser()
    const hasSurplusLimit = body && Object.prototype.hasOwnProperty.call(body, 'bank_ring_surplus_limit_kcal')
    const hasDeficitLimit = body && Object.prototype.hasOwnProperty.call(body, 'bank_ring_deficit_limit_kcal')
    if (hasSurplusLimit && (!Number.isInteger(body.bank_ring_surplus_limit_kcal) || body.bank_ring_surplus_limit_kcal <= 0)) {
      return err(400, 'bank_ring_surplus_limit_kcal must be greater than 0')
    }
    if (hasDeficitLimit && (!Number.isInteger(body.bank_ring_deficit_limit_kcal) || body.bank_ring_deficit_limit_kcal <= 0)) {
      return err(400, 'bank_ring_deficit_limit_kcal must be greater than 0')
    }
    if (hasSurplusLimit) account.bank_ring_surplus_limit_kcal = body.bank_ring_surplus_limit_kcal
    if (hasDeficitLimit) account.bank_ring_deficit_limit_kcal = body.bank_ring_deficit_limit_kcal

    if (body && Object.prototype.hasOwnProperty.call(body, 'bank_window_days')) {
      const days = body.bank_window_days
      if (!Number.isInteger(days) || days < 0) {
        return err(400, 'bank_window_days must be 0 (all time) or a number of days')
      }
      account.bank_window_days = days
    }
    if (body && Object.prototype.hasOwnProperty.call(body, 'weight_trend_days')) {
      const weighIns = body.weight_trend_days
      if (!Number.isInteger(weighIns) || weighIns < 3 || weighIns > 90) {
        return err(400, 'weight_trend_days must be between 3 and 90 weigh-ins')
      }
      account.weight_trend_days = weighIns
    }
    // Slice 14.4 (decision 97): the body map's silhouette preference. Only the
    // two known shapes are accepted, exactly as internal/handlers/users.go.
    if (body && Object.prototype.hasOwnProperty.call(body, 'body_outline')) {
      const outline = body.body_outline
      if (outline !== 'female' && outline !== 'male') {
        return err(400, 'body_outline must be "female" or "male"')
      }
      account.body_outline = outline
    }
    // Slice 14.5: target weight in kg (nullable — null clears it). The
    // additive column existed but was neither SELECTed nor written by any
    // handler before 14.5, so the Target tile on Metrics was permanently
    // "Not set". Accepting null lets the user clear it.
    if (body && Object.prototype.hasOwnProperty.call(body, 'target_weight_kg')) {
      const t = body.target_weight_kg
      if (t === null || t === undefined) {
        account.target_weight_kg = undefined
      } else {
        const n = Number(t)
        if (!Number.isFinite(n) || n <= 20 || n >= 300) {
          return err(400, 'target_weight_kg must be a reasonable weight in kg, or null to clear')
        }
        account.target_weight_kg = Math.round(n * 10) / 10
      }
    }
    return json(account)
  }

  // Session: who is signed in and whose data is on screen. Mirrors
  // internal/handlers/actinguser.go, including the rule that the Admin flag
  // belongs to the authenticated identity, not the acting one.
  if (pathname === '/api/session' && method === 'GET') {
    const authenticated = users[0] // the fixture always signs in as the Admin
    const acting = currentUser()
    return json({
      authenticated_user: authenticated,
      acting_user: acting,
      is_admin: Boolean(authenticated.is_admin),
      viewing_as_other: acting.id !== authenticated.id,
    })
  }

  // Admin-only account list, exactly as the Go handler now gated it.
  if (pathname === '/api/users' && method === 'GET') {
    const authenticated = users[0]
    if (!authenticated.is_admin) return err(403, 'Forbidden: the Admin role is required to list accounts')
    return json(users)
  }

  if (pathname === '/api/session/acting-user' && method === 'POST') {
    const authenticated = users[0]
    if (!authenticated.is_admin) {
      return err(403, 'Forbidden: the Admin role is required to act as another user')
    }
    const userId = Number.parseInt(String(body?.user_id ?? ''), 10)
    if (!Number.isFinite(userId) || userId <= 0) return err(400, 'user_id is required')
    const target = users.find((candidate) => candidate.id === userId)
    if (!target) return err(404, 'No such user')

    actingUserId = target.id === authenticated.id ? authenticated.id : target.id
    const switching = actingUserId !== authenticated.id
    return json(
      {
        authenticated_user: authenticated,
        acting_user: currentUser(),
        is_admin: true,
        viewing_as_other: switching,
      },
      200,
      switching ? actingUserCookie(target.id) : actingUserCookie(target.id, true),
    )
  }

  if (pathname === '/api/session/acting-user' && method === 'DELETE') {
    const authenticated = users[0]
    actingUserId = authenticated.id
    return json(
      {
        authenticated_user: authenticated,
        acting_user: authenticated,
        is_admin: Boolean(authenticated.is_admin),
        viewing_as_other: false,
      },
      200,
      actingUserCookie(authenticated.id, true),
    )
  }

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

    // Uncached FatSecret hits come back as `fs_<id>` rows, exactly as
    // HandleSearchFoods returns them; picking one saves it locally.
    for (const hit of seed.uncachedFatSecretFoods) {
      if (results.length >= 20) break
      if (foods.some((food) => String(food.fatsecret_id ?? '') === String(hit.fatsecret_id))) continue
      if (!hit.name.toLowerCase().includes(q) && !(hit.brand ?? '').toLowerCase().includes(q)) continue
      results.push({
        id: `fs_${hit.fatsecret_id}`,
        fatsecret_id: hit.fatsecret_id,
        name: hit.name,
        ...(hit.brand ? { brand: hit.brand } : {}),
        // The real search result carries the calories parsed from the
        // FatSecret description and nothing else; the full values arrive when
        // the food is cached.
        calories_per_100g: hit.calories_per_100g,
        protein_per_100g: 0,
        carbs_per_100g: 0,
        fat_per_100g: 0,
        fibre_per_100g: 0,
        is_edited: false,
      })
    }
    return json(results)
  }

  const foodDetailMatch = pathname.match(/^\/api\/foods\/([^/]+)$/)
  if (foodDetailMatch && foodDetailMatch[1] !== 'custom' && method === 'GET') {
    const requestedId = foodDetailMatch[1]
    // A FatSecret id caches the hit on first fetch, matching HandleGetFood and
    // ensuring recipe writes only receive numeric IDs; a cached one is a lookup.
    const food = requestedId.startsWith('fs_')
      ? seed.cacheFatSecretFood(requestedId.slice(3))
      : seed.findFood(requestedId)
    if (!food) return err(404, 'Food not found')
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
    const entries = seed.entriesFor(date, actingUserId).map((entry) => {
      const food = entry.food_id != null ? seed.findFood(entry.food_id) : null
      const recipe = entry.recipe_id != null ? recipes.find((item) => item.id === entry.recipe_id) : null
      return {
        ...entry,
        ...(food ? { food_name: food.name } : {}),
        ...(recipe ? { recipe_name: recipe.name } : {}),
        ...(entry.food_id != null ? seed.foodMeasuresFor(entry.food_id) : {}),
      }
    })
    return json({ date, entries, totals: seed.totalsFor(date, actingUserId) })
  }

  if (pathname === '/api/bank' && method === 'GET') {
    const date = searchParams.get('date')
    if (!date) return err(400, 'date parameter is required')
    return json(bank(date))
  }

  if (pathname === '/api/drinks' && method === 'GET') {
    return json(drinks.filter((drink) => drink.user_id === actingUserId))
  }

  if (pathname === '/api/drinks/entries' && method === 'GET') {
    const date = searchParams.get('date') ?? today
    return json(seed.drinkEntriesFor(date, actingUserId))
  }

  // Water: one source of truth — drink entries for water-counting drinks.
  if (pathname === '/api/water' && method === 'GET') {
    const date = searchParams.get('date') ?? today
    return json(seed.waterFor(date, actingUserId))
  }

  if (pathname === '/api/weight' && method === 'GET') {
    const range = resolveSeriesRange(searchParams, 90, 0)
    if (range.error) return err(400, range.error)
    return json(
      weightEntries
        .filter((e) => e.user_id === actingUserId && e.date >= range.from && e.date <= range.to)
        .sort((a, b) => b.date.localeCompare(a.date)),
    )
  }

  // Measurements — mirrors internal/handlers/measurements.go since slice 14.4.
  // No parameters: V1's exact contract, the newest 20 rows whatever their age.
  // A window (from/to or days): every row inside it, same 400-day bound and
  // strict 400s as the other series endpoints.
  if (pathname === '/api/measurements' && method === 'GET') {
    const mine = () =>
      [...measurements]
        .filter((m) => m.user_id === actingUserId)
        .sort((a, b) => (b.date === a.date ? b.id - a.id : b.date.localeCompare(a.date)))
        .map((m) => ({
          id: m.id,
          user_id: m.user_id,
          date: m.date,
          bust_cm: m.bust_cm ?? null,
          chest_cm: m.chest_cm ?? null,
          waist_cm: m.waist_cm ?? null,
          hips_cm: m.hips_cm ?? null,
          upper_arm_cm: m.upper_arm_cm ?? null,
          thigh_cm: m.thigh_cm ?? null,
          neck_cm: m.neck_cm ?? null,
          created_at: m.created_at,
        }))

    if (!searchParams.get('from') && !searchParams.get('to') && !searchParams.get('days')) {
      return json(mine().slice(0, 20))
    }
    const range = resolveSeriesRange(searchParams, 20, MAX_SERIES_SPAN)
    if (range.error) return err(400, range.error)
    return json(mine().filter((m) => m.date >= range.from && m.date <= range.to))
  }

  // Per-part latest values for the body map's pop-up — no row limit can hide
  // them, and each carries the value before it.
  if (pathname === '/api/measurements/latest' && method === 'GET') {
    const parts = ['neck_cm', 'chest_cm', 'bust_cm', 'waist_cm', 'upper_arm_cm', 'hips_cm', 'thigh_cm']
    const rows = [...measurements]
      .filter((m) => m.user_id === actingUserId)
      .sort((a, b) => (b.date === a.date ? b.id - a.id : b.date.localeCompare(a.date)))
    const out = {}
    for (const part of parts) {
      const seen = rows.filter((m) => m[part] != null).slice(0, 2)
      out[part] =
        seen.length === 0
          ? null
          : {
              value: seen[0][part],
              date: seen[0].date,
              previous: seen[1] ? { value: seen[1][part], date: seen[1].date, previous: null } : null,
            }
    }
    return json(out)
  }

  // Decision 96: merge the posted parts into the day's row rather than
  // delete-and-reinsert — committing one part must not wipe the others.
  if (pathname === '/api/measurements' && method === 'POST') {
    if (!body || typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return err(400, 'Date must be YYYY-MM-DD')
    }
    const parts = ['neck_cm', 'chest_cm', 'bust_cm', 'waist_cm', 'upper_arm_cm', 'hips_cm', 'thigh_cm']
    const provided = {}
    for (const part of parts) {
      const value = body[part]
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) provided[part] = value
    }
    if (Object.keys(provided).length === 0) return err(400, 'At least one measurement is required')

    const existing = measurements.find((m) => m.user_id === actingUserId && m.date === body.date)
    if (existing) {
      Object.assign(existing, provided)
      return json({ id: existing.id }, 200)
    }
    const id = measurements.reduce((max, m) => Math.max(max, m.id), 0) + 1
    measurements.push({ id, user_id: actingUserId, date: body.date, created_at: `${body.date}T07:10:00Z`, ...provided })
    return json({ id }, 201)
  }

  const measurementMatch = pathname.match(/^\/api\/measurements\/(\d+)$/)
  if (measurementMatch) {
    const id = Number.parseInt(measurementMatch[1], 10)
    const entry = measurements.find((m) => m.id === id && m.user_id === actingUserId)

    // Decision 96's correction path: patch one entry. Absent keys stay,
    // explicit null clears, a positive number sets, anything else is a 400.
    if (method === 'PUT') {
      if (!entry) return err(404, 'Entry not found')
      const parts = ['neck_cm', 'chest_cm', 'bust_cm', 'waist_cm', 'upper_arm_cm', 'hips_cm', 'thigh_cm']
      const keys = Object.keys(body ?? {})
      for (const key of keys) {
        if (key !== 'date' && !parts.includes(key)) return err(400, `Unknown field: ${key}`)
      }
      if (keys.length === 0) return err(400, 'No fields to update')
      for (const key of keys) {
        if (key === 'date') {
          if (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
            return err(400, 'date must be YYYY-MM-DD')
          }
          entry.date = body.date
          continue
        }
        const value = body[key]
        if (value === null) {
          entry[key] = null
        } else if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
          entry[key] = value
        } else {
          return err(400, `${key} must be greater than zero (send null to clear it)`)
        }
      }
      return json({
        id: entry.id,
        user_id: entry.user_id,
        date: entry.date,
        bust_cm: entry.bust_cm ?? null,
        chest_cm: entry.chest_cm ?? null,
        waist_cm: entry.waist_cm ?? null,
        hips_cm: entry.hips_cm ?? null,
        upper_arm_cm: entry.upper_arm_cm ?? null,
        thigh_cm: entry.thigh_cm ?? null,
        neck_cm: entry.neck_cm ?? null,
        created_at: entry.created_at,
      })
    }

    if (method === 'DELETE') {
      if (!entry) return err(404, 'Entry not found')
      measurements.splice(measurements.indexOf(entry), 1)
      return { status: 204, body: '', contentType: 'application/json' }
    }
  }

  // Calories are food **and** drink, mirroring internal/handlers/stats.go: a
  // chart built on this endpoint must not disagree with the ring.
  if (pathname === '/api/stats/calories' && method === 'GET') {
    const range = resolveSeriesRange(searchParams, 14)
    if (range.error) return err(400, range.error)
    const out = []
    for (let date = range.from; date <= range.to; date = seed.nextDate(date)) {
      const drinks = seed
        .drinkEntriesFor(date, actingUserId)
        .reduce((acc, e) => acc + e.calories, 0)
      out.push({
        date,
        calories: num(seed.totalsFor(date, actingUserId).calories + drinks),
        goal: currentUser().daily_calorie_goal,
      })
    }
    return json(out)
  }

  if (pathname === '/api/stats/bank' && method === 'GET') {
    const range = resolveSeriesRange(searchParams, 14)
    if (range.error) return err(400, range.error)
    const bankStart = currentUser().bank_start_date
    const out = []
    for (let date = range.from; date <= range.to; date = seed.nextDate(date)) {
      // Each row is that day's closing balance — the bank as of the next
      // morning, exactly as internal/handlers/stats.go computes it — and the
      // series begins on the bank's start day.
      if (bankStart && date < bankStart) continue
      out.push({ date, balance: bank(seed.nextDate(date)).bank_balance })
    }
    return json(out)
  }

  if (pathname === '/api/nutrition/settings' && method === 'GET') return json(nutritionSettings)

  if (pathname === '/api/nutrition/weekly' && method === 'GET') {
    // Slice 14.6: an explicit from/to pair (the weekly report's picker) wins;
    // otherwise the legacy `days` window ending today, exactly as before.
    if (searchParams.get('from') || searchParams.get('to')) {
      const range = resolveSeriesRange(searchParams, 7, MAX_SERIES_SPAN)
      if (range.error) return err(400, range.error)
      return json(nutritionAnalysisRange(range.from, range.to))
    }
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
    const bankStart = currentUser().bank_start_date

    for (let i = 0; i < dayCount; i++) {
      const date = isoFromMs(startMs + i * 24 * 60 * 60 * 1000)
      const entries = seed.entriesFor(date, actingUserId)
      const meals = { breakfast: 0, lunch: 0, dinner: 0, snacks: 0 }
      let foodCal = 0
      for (const e of entries) {
        meals[e.meal] = Math.round((meals[e.meal] ?? 0) + e.calories)
        foodCal += e.calories
      }
      const drinkCal = seed
        .drinkEntriesFor(date, actingUserId)
        .reduce((acc, e) => acc + e.calories, 0)
      const hydrationMl = seed
        .drinkEntriesFor(date, actingUserId)
        .filter((e) => waterDrinkIds.has(e.drink_id))
        .reduce((acc, e) => acc + e.volume_ml, 0)
      const totalCal = foodCal + drinkCal

      // End-of-day bank balance: the same windowed rule as GET /api/bank, for
      // the next morning (decisions 42, 66, 91, 92) — so a cell can never
      // disagree with the tile on Today.
      const bankBalance = bankStart && date >= bankStart ? bank(addDays(date, 1)).bank_balance : 0

      days.push({
        date,
        food_calories: num(foodCal),
        drink_calories: num(drinkCal),
        calories: num(totalCal),
        goal: currentUser().daily_calorie_goal,
        hydration_ml: hydrationMl,
        hydration_target_ml: currentUser().daily_water_goal_ml,
        bank_balance: bankBalance,
        meals,
        is_today: date === TODAY,
        has_data: totalCal > 0 || hydrationMl > 0,
      })
    }

    return json({
      from,
      to,
      daily_goal: currentUser().daily_calorie_goal,
      bank_start: bankStart,
      bank_window_days: currentUser().bank_window_days ?? 14,
      days,
    })
  }

  // --- mutations so the authoring and logging flows are clickable ----------
  if (pathname === '/api/recipes' && method === 'POST') {
    const created = buildNewRecipe(body, foods, seed.nextRecipeId(), currentUser())
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
    seed.drinkEntries.push({ ...entry, user_id: actingUserId, created_at: new Date().toISOString() })
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

// Mirrors resolveSeriesRange in internal/handlers/stats.go: an explicit
// from/to pair wins, otherwise `days` counts back from today. A malformed range
// is a 400 rather than a silently narrowed window. `to` is pulled back to today
// because these endpoints fabricate a row per calendar day.
const MAX_SERIES_SPAN = 400

function resolveSeriesRange(searchParams, defaultDays, maxDays = 90) {
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const isoDate = /^\d{4}-\d{2}-\d{2}$/

  if (!from && !to) {
    // Lenient, exactly as the Go handlers have always been: an unparseable or
    // out-of-range `days` falls back to the default rather than erroring.
    let days = defaultDays
    const raw = searchParams.get('days') ?? ''
    if (/^\d+$/.test(raw)) {
      const parsed = Number.parseInt(raw, 10)
      if (parsed > 0 && (maxDays === 0 || parsed <= maxDays)) days = parsed
    }
    return { from: seed.dateOffset(days - 1), to: seed.TODAY }
  }
  if (!from || !to) return { error: 'from and to must both be given (YYYY-MM-DD)' }
  if (!isoDate.test(from)) return { error: 'invalid from date (want YYYY-MM-DD)' }
  if (!isoDate.test(to)) return { error: 'invalid to date (want YYYY-MM-DD)' }
  if (to < from) return { error: 'to must be on or after from' }
  if (seed.daysBetween(from, to) + 1 > MAX_SERIES_SPAN) return { error: `range exceeds ${MAX_SERIES_SPAN} days` }
  return { from, to: to > seed.TODAY ? seed.TODAY : to }
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
      (entry) => entry.recipe_id === recipe.id && entry.user_id === actingUserId,
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

const json = (body, status = 200, headers) => ({
  status,
  body,
  contentType: 'application/json',
  ...(headers ? { headers } : {}),
})
const err = (status, message) => json({ error: message }, status)

function actingUserCookie(userId, clear = false) {
  const value = `cals_acting_user=${userId}; Path=/; HttpOnly; SameSite=Lax${clear ? '; Max-Age=0' : ''}`
  return { 'Set-Cookie': value }
}

export { TODAY, drinkEntries }
