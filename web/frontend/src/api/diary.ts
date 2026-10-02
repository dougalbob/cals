import { apiDelete, apiGet, apiPost } from './client'
import type { BankResponse, DiaryEntry, DiaryResponse, Drink, DrinkEntry, Meal, WaterResponse } from './types'

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

/** Add a drink entry. `volumeMl` overrides the drink's typical volume. */
export function addDrinkEntry(drinkId: number, date: string, volumeMl?: number): Promise<DrinkEntry> {
  return apiPost<DrinkEntry>('/api/drinks/entries', {
    drink_id: drinkId,
    date,
    ...(volumeMl && volumeMl > 0 ? { volume_ml: volumeMl } : {}),
  })
}

export function deleteDrinkEntry(id: number): Promise<void> {
  return apiDelete<void>(`/api/drinks/entries/${id}`)
}

export function createDiaryEntry(date: string, input: CreateDiaryEntryInput): Promise<DiaryEntry> {
  return apiPost<DiaryEntry>('/api/diary', { ...input, date })
}

export function deleteDiaryEntry(id: number): Promise<void> {
  return apiDelete<void>(`/api/diary/${id}`)
}
