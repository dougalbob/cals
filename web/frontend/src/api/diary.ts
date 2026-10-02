import { apiDelete, apiGet, apiPost } from './client'
import type { BankResponse, DiaryEntry, DiaryResponse, DrinkEntry, Meal } from './types'

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

export function createDiaryEntry(date: string, input: CreateDiaryEntryInput): Promise<DiaryEntry> {
  return apiPost<DiaryEntry>('/api/diary', { ...input, date })
}

export function deleteDiaryEntry(id: number): Promise<void> {
  return apiDelete<void>(`/api/diary/${id}`)
}
