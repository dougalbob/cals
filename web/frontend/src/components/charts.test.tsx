// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { BarChart, LineChart, goalBand } from './charts'

const fills = (container: HTMLElement) =>
  [...container.querySelectorAll('rect')].map((rect) => rect.getAttribute('fill'))

describe('goalBand', () => {
  it('is under at or below the goal, amber in the first 10% over, red beyond', () => {
    expect(goalBand(1000, 1000)).toBe('under')
    expect(goalBand(1001, 1000)).toBe('amber')
    expect(goalBand(1100, 1000)).toBe('amber')
    expect(goalBand(1101, 1000)).toBe('over')
  })

  it('treats a missing goal as no band at all', () => {
    expect(goalBand(1500, 0)).toBe('under')
  })
})

describe('BarChart goal bands', () => {
  it('paints green below, amber to 10% over and red beyond (decision 71)', () => {
    const { container } = render(
      <BarChart
        bands
        accent="#26de81"
        goal={1000}
        points={[
          { label: 'under', value: 900 },
          { label: 'amber', value: 1050 },
          { label: 'over', value: 1400 },
        ]}
      />,
    )
    expect(fills(container)).toEqual(['#26de81', '#fed330', '#fc5c65'])
  })

  it('keeps the plain over-goal colouring when bands are off', () => {
    const { container } = render(
      <BarChart
        goal={1000}
        points={[
          { label: 'under', value: 900 },
          { label: 'over', value: 1105 },
        ]}
      />,
    )
    expect(fills(container)).toEqual(['#4a90d9', '#fc5c65'])
  })
})

describe('LineChart dots and trend', () => {
  it('draws raw weigh-ins as points and the moving average as a dashed line', () => {
    const { container } = render(
      <LineChart
        dots
        points={[
          { label: '1 Oct', value: 95.4 },
          { label: '2 Oct', value: 95.1 },
          { label: '3 Oct', value: 94.9 },
          { label: '4 Oct', value: 94.8 },
        ]}
        trend={[null, null, 95.13, 94.95]}
      />,
    )
    expect(container.querySelectorAll('circle')).toHaveLength(4)
    expect(container.querySelectorAll('[data-testid="trend-segment"]')).toHaveLength(1)
    // No raw line and no filled area when the observations are points.
    expect(container.querySelectorAll('path[fill="none"]').length).toBe(1)
  })

  it('shows the first average at three weigh-ins as a point, not a line', () => {
    const { container } = render(
      <LineChart
        dots
        points={[
          { label: '1 Oct', value: 95.4 },
          { label: '2 Oct', value: 95.1 },
          { label: '3 Oct', value: 94.9 },
        ]}
        trend={[null, null, 95.13]}
      />,
    )
    expect(container.querySelectorAll('[data-testid="trend-point"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-testid="trend-segment"]')).toHaveLength(0)
  })

  it('draws nothing for a gap in the trend rather than bridging it', () => {
    const { container } = render(
      <LineChart
        dots
        points={[
          { label: '1 Oct', value: 95.4 },
          { label: '2 Oct', value: 95.1 },
          { label: '3 Oct', value: 94.9 },
          { label: '4 Oct', value: 94.8 },
        ]}
        trend={[null, null, 95, null]}
      />,
    )
    // The isolated average is a point; nothing bridges it to the gap.
    expect(container.querySelectorAll('[data-testid="trend-segment"]')).toHaveLength(0)
    expect(container.querySelectorAll('[data-testid="trend-point"]')).toHaveLength(1)
  })

  it('keeps a small wobble from filling the chart when a minimum span is given', () => {
    const points = [
      { label: '1 Oct', value: 95.0 },
      { label: '2 Oct', value: 95.2 },
    ]
    const plain = render(<LineChart dots points={points} />)
    const padded = render(<LineChart dots points={points} minSpan={2} />)
    const spread = (container: HTMLElement) => {
      const circles = [...container.querySelectorAll('circle')]
      return Math.abs(Number(circles[0].getAttribute('cy')) - Number(circles[1].getAttribute('cy')))
    }
    expect(spread(padded.container)).toBeLessThan(spread(plain.container))
  })
})
