// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { FluidsCard } from './FluidsCard'

afterEach(cleanup)

describe('FluidsCard hydration status', () => {
  function renderCard(consumedMl: number, targetMl: number) {
    return render(
      <MemoryRouter>
        <FluidsCard
          consumedMl={consumedMl}
          targetMl={targetMl}
          waterDrink={null}
          drinks={[]}
          entries={[]}
          onAddDrink={() => undefined}
          pendingDrinkId={null}
          error={null}
        />
      </MemoryRouter>,
    )
  }

  it('uses the current daily target for the glass label and turns it 90 degrees clockwise', () => {
    renderCard(0, 1000)

    const target = screen.getByText('1,000 ml')
    expect(target.getAttribute('transform')).toBe('rotate(90 32 56)')
    expect(screen.getByText('1,000')).toBeTruthy()
    expect(screen.getByText('ml to go')).toBeTruthy()
  })

  it('says the target was reached without an overage at exactly the target', () => {
    renderCard(1000, 1000)

    expect(screen.getByText('Target reached 🎉')).toBeTruthy()
  })

  it('shows how far hydration exceeded the target', () => {
    renderCard(1250, 1000)

    expect(screen.getByText('Target (+250 ml) reached 🎉')).toBeTruthy()
  })
})
