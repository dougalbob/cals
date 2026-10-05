import { describe, expect, it } from 'vitest'
import { movingAverageOverWeighIns } from './trend'

describe('movingAverageOverWeighIns', () => {
  it('stays null until three weigh-ins exist', () => {
    // One or two points are noise; a trend over them would be dishonest
    // (decision 95), so those positions draw nothing at all.
    expect(movingAverageOverWeighIns([100, 99], 7)).toEqual([null, null])
    expect(movingAverageOverWeighIns([], 7)).toEqual([])
  })

  it('averages the observations themselves rather than calendar days', () => {
    // Three weigh-ins in a row each count once, however many days apart they
    // are — a calendar window would come up empty on the days nobody weighed.
    expect(movingAverageOverWeighIns([10, 20, 30], 7)).toEqual([null, null, 20])
  })

  it('slides a window of the given number of weigh-ins', () => {
    expect(movingAverageOverWeighIns([10, 20, 30, 40], 3)).toEqual([null, null, 20, 30])
    // A window wider than the data simply averages everything so far.
    expect(movingAverageOverWeighIns([10, 20, 30, 40], 90)[3]).toBe(25)
  })

  it('never extrapolates past the last observation', () => {
    const trend = movingAverageOverWeighIns([10, 20, 30], 7)
    expect(trend).toHaveLength(3)
    expect(trend.filter((value) => value == null)).toHaveLength(2)
  })
})
