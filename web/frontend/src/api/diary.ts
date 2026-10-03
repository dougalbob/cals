import { apiDelete, apiGet, apiPost, apiPut } from './client'
import type { DiaryQuantityUpdate } from '../lib/diary'
import type {
  BankResponse,
  DiaryEntry,
  DiaryResponse,
  Drink,
  DrinkEntry,
  DrinkInput,
  Meal,
  WaterResponse,
} from './types'

export interface CreateDiaryEntryInput {
  meal: Meal
  food_id?: number
  recipe_id?: number
  quantity_grams: number
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  fibre?: number
}

/** Typed same-origin API functions for the Diary's core resources. */
export function getDiary(date: string): Promise<DiaryResponse> {
  return apiGet<DiaryResponse>(`/api/diary?date=${encodeURIComponent(date)}`)
}

export function getBank(date: string): Promise<BankResponse> {
  return apiGet<BankResponse>(`/api/bank?date=${encodeURIComponent(date)}`)
}

export function getDrinkEntries(date: string): Promise<DrinkEntry[]> {
  return apiGet<DrinkEntry[]>(`/api/drinks/entries?date=${encodeURIComponent(date)}`)
}

export function getDrinks(): Promise<Drink[]> {
  return apiGet<Drink[]>('/api/drinks')
}

export function getWater(date: string): Promise<WaterResponse> {
  return apiGet<WaterResponse>(`/api/water?date=${encodeURIComponent(date)}`)
}

/** Add a drink entry. `volumeMl` overrides typical volume; `calories` snapshots a vary-this-time log. */
export function addDrinkEntry(
  drinkId: number,
  date: string,
  opts?: { volumeMl?: number; calories?: number },
): Promise<DrinkEntry> {
  const volumeMl = opts?.volumeMl
  const calories = opts?.calories
  return apiPost<DrinkEntry>('/api/drinks/entries', {
    drink_id: drinkId,
    date,
    ...(volumeMl && volumeMl > 0 ? { volume_ml: volumeMl } : {}),
    ...(calories !== undefined && calories >= 0 ? { calories } : {}),
  })
}

export function createDrink(input: DrinkInput): Promise<Drink> {
  return apiPost<Drink>('/api/drinks', input)
}

export function updateDrink(id: number, input: DrinkInput): Promise<Drink> {
  return apiPut<Drink>(`/api/drinks/${id}`, input)
}

export function deleteDrink(id: number): Promise<void> {
  return apiDelete<void>(`/api/drinks/${id}`)
}

export function deleteDrinkEntry(id: number): Promise<void> {
  return apiDelete<void>(`/api/drinks/entries/${id}`)
}

export function createDiaryEntry(date: string, input: CreateDiaryEntryInput): Promise<DiaryEntry> {
  return apiPost<DiaryEntry>('/api/diary', { ...input, date })
}

/**
 * Change the weight of a logged entry.
 *
 * The scaled nutrition values are sent rather than a bare new weight, because the
 * Go handler writes exactly the fields it is given — and the entry's saved
 * snapshot is the correct source, not the food/recipe definition it came from.
 */
export function updateDiaryEntry(id: number, input: DiaryQuantityUpdate): Promise<void> {
  return apiPut<void>(`/api/diary/${id}`, input)
}

export function deleteDiaryEntry(id: number): Promise<void> {
  return apiDelete<void>(`/api/diary/${id}`)
}
