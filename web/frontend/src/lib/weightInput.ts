import { kgToStonesPounds, stonesPoundsToKg } from './format'

export type WeightUnit = 'kg' | 'stones'

export interface WeightInputValues {
  kg: string
  stones: string
  pounds: string
}

export function emptyWeightInput(): WeightInputValues {
  return { kg: '', stones: '', pounds: '' }
}

export function weightInputFromKg(kg: number, unit: WeightUnit): WeightInputValues {
  if (unit === 'kg') return { kg: kg.toFixed(1), stones: '', pounds: '' }
  const { stones, pounds } = kgToStonesPounds(kg)
  return { kg: '', stones: String(stones), pounds: pounds.toFixed(1) }
}

export function weightInputIsEmpty(value: WeightInputValues, unit: WeightUnit): boolean {
  return unit === 'kg'
    ? value.kg.trim() === ''
    : value.stones.trim() === '' && value.pounds.trim() === ''
}

/** Parse the active fields; a completely blank value returns null. */
export function weightInputToKg(value: WeightInputValues, unit: WeightUnit): number | null {
  if (weightInputIsEmpty(value, unit)) return null

  if (unit === 'kg') {
    const kg = Number(value.kg)
    return Number.isFinite(kg) ? kg : null
  }

  const stones = value.stones.trim() === '' ? 0 : Number(value.stones)
  const pounds = value.pounds.trim() === '' ? 0 : Number(value.pounds)
  if (!Number.isFinite(stones) || !Number.isFinite(pounds)) return null
  return stonesPoundsToKg(stones, pounds)
}

/** Validate the shared Target / weigh-in input before sending canonical kg. */
export function validateWeightInput(value: WeightInputValues, unit: WeightUnit): string | null {
  if (weightInputIsEmpty(value, unit)) return 'Enter a weight.'

  if (unit === 'kg') {
    const kg = Number(value.kg)
    if (!Number.isFinite(kg) || kg <= 0) return 'Enter a weight greater than zero.'
    if (kg <= 20 || kg >= 300) return 'Enter a weight above 20 kg and below 300 kg.'
    return null
  }

  const stones = value.stones.trim() === '' ? 0 : Number(value.stones)
  const pounds = value.pounds.trim() === '' ? 0 : Number(value.pounds)
  if (!Number.isFinite(stones) || stones < 0 || !Number.isInteger(stones)) {
    return 'Stones must be a whole number of zero or more.'
  }
  if (!Number.isFinite(pounds) || pounds < 0 || pounds >= 14) {
    return 'Pounds must be between 0 and 13.9.'
  }
  if (Math.abs(pounds * 10 - Math.round(pounds * 10)) > 1e-8) {
    return 'Pounds can have at most one decimal place.'
  }

  const kg = stonesPoundsToKg(stones, pounds)
  if (kg <= 20 || kg >= 300) return 'Enter a weight above 20 kg and below 300 kg.'
  return null
}
