import { describe, expect, it } from 'vitest'
import {
  emptyWeightInput,
  validateWeightInput,
  weightInputFromKg,
  weightInputIsEmpty,
  weightInputToKg,
} from './weightInput'
import { stonesPoundsToKg } from './format'

describe('weight input fields', () => {
  it('prefills the chosen unit from canonical kg', () => {
    expect(weightInputFromKg(79.4, 'kg')).toEqual({ kg: '79.4', stones: '', pounds: '' })
    expect(weightInputFromKg(stonesPoundsToKg(12, 7.1), 'stones')).toEqual({
      kg: '',
      stones: '12',
      pounds: '7.1',
    })
  })

  it('parses stones and decimal pounds as one canonical kg value', () => {
    const value = { kg: '', stones: '12', pounds: '7.1' }
    expect(weightInputIsEmpty(value, 'stones')).toBe(false)
    expect(weightInputToKg(value, 'stones')).toBeCloseTo(stonesPoundsToKg(12, 7.1))
    expect(validateWeightInput(value, 'stones')).toBeNull()
  })

  it('treats two empty stone/pound fields as empty and keeps kg independent', () => {
    const empty = emptyWeightInput()
    expect(weightInputIsEmpty(empty, 'stones')).toBe(true)
    expect(weightInputIsEmpty(empty, 'kg')).toBe(true)
    expect(validateWeightInput(empty, 'stones')).toBe('Enter a weight.')

    const kg = { ...empty, kg: '78.5' }
    expect(weightInputIsEmpty(kg, 'kg')).toBe(false)
    expect(weightInputToKg(kg, 'kg')).toBe(78.5)
    expect(validateWeightInput(kg, 'kg')).toBeNull()
  })

  it('rejects fractional stones and pounds outside the 0–13.9 lb remainder', () => {
    expect(validateWeightInput({ kg: '', stones: '12.5', pounds: '0' }, 'stones')).toContain('whole number')
    expect(validateWeightInput({ kg: '', stones: '12', pounds: '14' }, 'stones')).toContain('between 0 and 13.9')
    expect(validateWeightInput({ kg: '', stones: '12', pounds: '7.11' }, 'stones')).toContain('one decimal place')
  })

  it('rejects implausible weights rather than submitting them silently', () => {
    expect(validateWeightInput({ kg: '10', stones: '', pounds: '' }, 'kg')).toContain('above 20 kg')
    expect(validateWeightInput({ kg: '', stones: '0', pounds: '0' }, 'stones')).toContain('above 20 kg')
  })
})
