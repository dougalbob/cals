import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet, queryKeys } from '../api/client'
import type { Food } from '../api/types'
import { useDebounced } from '../hooks/useDebounced'
import { formatNumber } from '../lib/format'

export function FoodsRoute() {
  const [term, setTerm] = useState('')
  const debounced = useDebounced(term, 250)

  const search = useQuery<Food[]>({
    queryKey: queryKeys.foodSearch(debounced),
    queryFn: () => apiGet<Food[]>(`/api/foods/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.trim().length >= 2,
  })

  const custom = useQuery<Food[]>({
    queryKey: queryKeys.customFoods,
    queryFn: () => apiGet<Food[]>('/api/foods/custom'),
  })

  const showSearch = debounced.trim().length >= 2

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl bg-card p-4 shadow-card">
        <h2 className="m-0 mb-2 text-base font-semibold">🔍 Search foods</h2>
        <input
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search local foods (FatSecret when configured)…"
          className="w-full min-h-11 rounded-xl border border-line px-3 text-base"
        />

        {showSearch && (
          <>
            {search.isFetching && <p className="text-sm text-ink-light mt-2 mb-0">Searching…</p>}
            <ul className="list-none m-0 p-0 mt-2">
              {(search.data ?? []).map((food) => (
                <FoodRow key={String(food.id)} food={food} />
              ))}
            </ul>
            {!search.isFetching && (search.data ?? []).length === 0 && (
              <p className="text-sm text-ink-muted mt-2 mb-0">No matches.</p>
            )}
          </>
        )}
      </section>

      <section className="rounded-2xl bg-card p-4 shadow-card">
        <h2 className="m-0 mb-1 text-base font-semibold">🥗 My foods</h2>
        <p className="m-0 mb-3 text-xs text-ink-light">
          {custom.data?.length ?? 0} custom {custom.data?.length === 1 ? 'food' : 'foods'} — matching{' '}
          <code>is_edited = true</code> in the foods table.
        </p>
        {custom.isPending ? (
          <p className="text-sm text-ink-light m-0">Loading…</p>
        ) : (
          <ul className="list-none m-0 p-0">
            {(custom.data ?? []).map((food) => (
              <FoodRow key={String(food.id)} food={food} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function FoodRow({ food }: { food: Food }) {
  return (
    <li className="py-2.5 border-b border-line-light last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium truncate">
          {food.name}
          {food.brand ? <span className="text-ink-light font-normal"> · {food.brand}</span> : null}
        </span>
        <span className="text-sm tabular-nums whitespace-nowrap">
          {formatNumber(food.calories_per_100g)} <span className="text-xs text-ink-light">kcal/100g</span>
        </span>
      </div>
      <div className="text-xs text-ink-light">
        P {food.protein_per_100g.toFixed(1)} · C {food.carbs_per_100g.toFixed(1)} · F{' '}
        {food.fat_per_100g.toFixed(1)} · Fibre {food.fibre_per_100g.toFixed(1)}
        {food.serving_name ? ` · ${food.serving_name}` : ''}
        {typeof food.id === 'string' ? ' · FatSecret' : ''}
      </div>
    </li>
  )
}
