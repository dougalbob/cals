import { useQuery } from '@tanstack/react-query'
import { getBank, getDiary, getDrinkEntries } from '../api/diary'
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
