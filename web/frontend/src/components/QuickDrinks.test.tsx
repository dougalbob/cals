// @vitest-environment jsdom
/**
 * The ⋯ (vary-this-time) button is driven by the drink's type, not only by the
 * stored flags: the extras columns arrived after the first drinks existed and
 * the additive migration defaulted every legacy row to "accepts nothing", which
 * made the button disappear from Tea and Coffee on real accounts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QuickDrinks } from './QuickDrinks'
import type { Drink } from '../api/types'

function drink(patch: Partial<Drink> & { id: number; name: string }): Drink {
  return {
    user_id: 1,
    icon: '🥤',
    volume_ml: 250,
    calories: 2,
    counts_toward_water: false,
    accepts_milk: false,
    accepts_sugar: false,
    usual_milk: false,
    usual_sugar: '0',
    sort_order: 0,
    ...patch,
  } as Drink
}

function renderDrinks(drinks: Drink[]) {
  return render(
    <MemoryRouter>
      <QuickDrinks drinks={drinks} pendingDrinkId={null} error={null} onAdd={() => {}} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.stubGlobal('navigator', { ...window.navigator })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('QuickDrinks vary button', () => {
  it('offers the ⋯ on a legacy Tea row whose stored flags were never set', () => {
    renderDrinks([drink({ id: 1, name: 'Tea', icon: '🫖' })])

    expect(screen.getByRole('button', { name: 'Change milk or sugar for this Tea' })).toBeTruthy()
  })

  it('offers the ⋯ when the row or its type accepts milk or sugar', () => {
    renderDrinks([
      drink({ id: 1, name: 'Coffee', accepts_milk: true, accepts_sugar: true }),
      drink({ id: 2, name: 'Cappuccino' }),
      drink({ id: 3, name: 'Juice' }),
    ])

    const quick = screen.getByLabelText('Quick drinks')
    expect(within(quick).getByRole('button', { name: 'Change milk or sugar for this Coffee' })).toBeTruthy()
    expect(within(quick).getByRole('button', { name: 'Change milk or sugar for this Cappuccino' })).toBeTruthy()
    // Juice accepts neither by type or by row — no button, by design.
    expect(within(quick).queryByRole('button', { name: 'Change milk or sugar for this Juice' })).toBeNull()
  })
})
