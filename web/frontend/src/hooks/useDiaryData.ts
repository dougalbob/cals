import { useQuery } from '@tanstack/react-query'
import { getBank, getDiary, getDrinkEntries, getDrinks, getWater } from '../api/diary'
import { queryKeys } from '../api/client'

/** Server state stays in TanStack Query; date is part of each stable resource key. */
export function useDiary(date: string) {
  return useQuery({
    queryKey: queryKeys.diary(date),
    queryFn: () => getDiary(date),
  })
}

export function useBank(date: string) {
  return useQuery({
    queryKey: queryKeys.bank(date),
    queryFn: () => getBank(date),
  })
}

export function useDrinkEntries(date: string) {
  return useQuery({
    queryKey: queryKeys.drinks(date),
    queryFn: () => getDrinkEntries(date),
  })
}

/** The signed-in user's own drink definitions — never a shared/hard-coded list. */
export function useDrinkDefinitions() {
  return useQuery({
    queryKey: queryKeys.drinkDefinitions,
    queryFn: getDrinks,
  })
}

export function useWater(date: string) {
  return useQuery({
    queryKey: queryKeys.water(date),
    queryFn: () => getWater(date),
  })
}
