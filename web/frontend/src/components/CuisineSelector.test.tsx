// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { CuisineSelector } from './CuisineSelector'
import { SUGGESTED_RECIPE_CUISINES } from '../api/types'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** Mirrors how both callers use it: a fieldset supplies the group and its name. */
function renderSelector(
  value = '',
  knownCuisines: readonly string[] = [],
  onChange: (cuisine: string) => void = () => {},
) {
  return render(
    <fieldset>
      <legend>Cuisine</legend>
      <CuisineSelector value={value} knownCuisines={knownCuisines} onChange={onChange} />
    </fieldset>,
  )
}

const chipRow = () => screen.getByRole('group', { name: 'Cuisine' })

describe('CuisineSelector', () => {
  it('offers the suggested cuisines, then those already in use', () => {
    renderSelector('', ['Peruvian', 'Indian'])
    const names = within(chipRow())
      .getAllByRole('button')
      .map((button) => button.textContent)
      .filter((label) => label !== '＋ New…')
    expect(names.slice(0, SUGGESTED_RECIPE_CUISINES.length)).toEqual([...SUGGESTED_RECIPE_CUISINES])
    expect(names).toContain('Peruvian')
  })

  it('marks the recipe’s cuisine as pressed and clears it when tapped again', () => {
    const onChange = vi.fn()
    renderSelector('Thai', [], onChange)

    const thai = within(chipRow()).getByRole('button', { name: 'Remove the Thai cuisine' })
    expect(thai.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(thai)
    expect(onChange).toHaveBeenCalledWith('')

    onChange.mockClear()
    // A recipe whose cuisine is not in the suggested list still shows it.
    cleanup()
    renderSelector('Peruvian', [], onChange)
    fireEvent.click(within(chipRow()).getByRole('button', { name: 'Remove the Peruvian cuisine' }))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('sets a cuisine with one tap', () => {
    const onChange = vi.fn()
    renderSelector('', [], onChange)
    fireEvent.click(within(chipRow()).getByRole('button', { name: 'Set the cuisine to Korean' }))
    expect(onChange).toHaveBeenCalledWith('Korean')
  })

  it('creates a cuisine that is not listed with “New…”', () => {
    const onChange = vi.fn()
    renderSelector('', [], onChange)

    fireEvent.click(screen.getByRole('button', { name: 'Add a cuisine that is not listed' }))
    const input = screen.getByRole('textbox', { name: 'New cuisine' })
    fireEvent.change(input, { target: { value: '  Peruvian  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add cuisine' }))

    expect(onChange).toHaveBeenCalledWith('Peruvian')
    // The draft closes, so the new cuisine is just another chip.
    expect(screen.queryByRole('textbox', { name: 'New cuisine' })).toBeNull()
  })

  it('refuses a blank or over-long cuisine and stays open', () => {
    const onChange = vi.fn()
    renderSelector('', [], onChange)

    fireEvent.click(screen.getByRole('button', { name: 'Add a cuisine that is not listed' }))
    const input = screen.getByRole('textbox', { name: 'New cuisine' })

    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add cuisine' }))
    expect(screen.getByRole('alert').textContent).toBe('Type the cuisine you want to add.')
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: 'x'.repeat(41) } })
    fireEvent.click(screen.getByRole('button', { name: 'Add cuisine' }))
    expect(screen.getByRole('alert').textContent).toBe('Keep the cuisine to 40 characters or fewer.')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'New cuisine' })).toBeTruthy()
  })

  it('accepts Enter and closes on Cancel without changing anything', () => {
    const onChange = vi.fn()
    renderSelector('', [], onChange)

    fireEvent.click(screen.getByRole('button', { name: 'Add a cuisine that is not listed' }))
    const input = screen.getByRole('textbox', { name: 'New cuisine' })
    fireEvent.change(input, { target: { value: 'Greek' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('Greek')

    onChange.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Add a cuisine that is not listed' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'New cuisine' }), {
      target: { value: 'Greek' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox', { name: 'New cuisine' })).toBeNull()
  })

  it('explains how to remove a chosen cuisine', () => {
    renderSelector('Italian')
    expect(screen.getByText(/Tap the cuisine again to remove it/)).toBeTruthy()
  })
})
