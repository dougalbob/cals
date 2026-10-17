// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { RecipeRatingGuide, RecipeRatingHint } from './RecipeRatingGuides'

afterEach(cleanup)

// Chicken Curry as the mock API computes it: 1050 g cooked,
// 1710.6 kcal, 3.7 g fat, 12.1 g carbs and 0.6 g fibre per 100 g.
const curry = {
  total_weight_grams: 1050,
  total_calories: 1710.6,
  fat_per_100g: 3.7,
  carbs_per_100g: 12.1,
  fibre_per_100g: 0.6,
}

describe('RecipeRatingHint (catalogue card)', () => {
  it('shows the overall guide and the four individual guides', () => {
    render(<RecipeRatingHint recipe={curry} />)

    expect(screen.getByTestId('recipe-rating-hint')).toBeTruthy()
    expect(screen.getByTestId('rating-star-overall').textContent).toContain('2.5')
    expect(screen.getByTestId('rating-star-fat').textContent).toContain('4')
    expect(screen.getByTestId('rating-star-fibre').textContent).toContain('1')
    expect(screen.getByTestId('rating-star-carbs').textContent).toContain('3')
    expect(screen.getByTestId('rating-star-volume').textContent).toContain('2')
  })

  it('describes every guide accessibly, value and band included', () => {
    render(<RecipeRatingHint recipe={curry} />)

    expect(
      screen.getByRole('img', { name: 'Fat: 3.7 g/100 g, rated 4 out of 5 — low fat' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('img', { name: 'Fibre: 0.6 g/100 g, rated 1 out of 5 — low fibre' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('img', { name: 'Carbs: 12.1 g/100 g, rated 3 out of 5 — moderate carbs' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('img', { name: 'Volume: 0.6 g/kcal, rated 2 out of 5 — low volume' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('img', {
        name: 'Overall: 2.5 out of 5 — the average of the fat, fibre, carbs and volume guides',
      }),
    ).toBeTruthy()
  })

  it('renders nothing for a recipe that cannot be rated', () => {
    const { container } = render(
      <RecipeRatingHint recipe={{ ...curry, total_weight_grams: 0 }} />,
    )
    expect(container.firstChild).toBeNull()
  })
})

describe('RecipeRatingGuide (recipe detail)', () => {
  it('shows each measured value with its band words', () => {
    render(<RecipeRatingGuide recipe={curry} />)

    expect(screen.getByTestId('recipe-rating-guide')).toBeTruthy()
    expect(screen.getByTestId('rating-guide-overall').textContent).toContain('2.5')
    expect(
      screen.getByRole('img', { name: 'Fat: 3.7 g/100 g, rated 4 out of 5 — low fat' }),
    ).toBeTruthy()
    expect(screen.getByText('Low fat')).toBeTruthy()
    expect(screen.getByText('Moderate carbs')).toBeTruthy()
    expect(screen.getByText('Low fibre')).toBeTruthy()
    expect(screen.getByText('Low volume')).toBeTruthy()
    expect(screen.getByText('Average of the four guides')).toBeTruthy()
  })

  it('explains that an unrateable recipe needs more information', () => {
    render(<RecipeRatingGuide recipe={{ ...curry, total_calories: 0 }} />)

    expect(
      screen.getByText('Rating guides need a cooked weight and calorie information for this recipe.'),
    ).toBeTruthy()
    expect(screen.queryByTestId('rating-guide-overall')).toBeNull()
  })
})
