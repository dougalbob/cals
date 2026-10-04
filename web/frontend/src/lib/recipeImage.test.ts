import { describe, expect, it } from 'vitest'
import { RECIPE_IMAGE_MAX_BYTES, recipeImageFileError } from './recipeImage'

describe('recipeImageFileError', () => {
  it('accepts supported phone and browser image formats', () => {
    expect(recipeImageFileError({ name: 'supper.jpg', type: 'image/jpeg', size: 20 })).toBeNull()
    expect(recipeImageFileError({ name: 'supper.png', type: 'image/png', size: 20 })).toBeNull()
    expect(recipeImageFileError({ name: 'supper.webp', type: 'image/webp', size: 20 })).toBeNull()
  })

  it('accepts a supported filename when the browser omits the MIME type', () => {
    expect(recipeImageFileError({ name: 'supper.webp', type: '', size: 20 })).toBeNull()
  })

  it('accepts a file exactly at the size limit', () => {
    expect(recipeImageFileError({ name: 'limit.jpg', type: 'image/jpeg', size: RECIPE_IMAGE_MAX_BYTES })).toBeNull()
  })

  it('rejects empty, over-limit and unsupported files', () => {
    expect(recipeImageFileError({ name: 'empty.jpg', type: 'image/jpeg', size: 0 })).toContain('empty')
    expect(recipeImageFileError({
      name: 'large.jpg',
      type: 'image/jpeg',
      size: RECIPE_IMAGE_MAX_BYTES + 1,
    })).toContain('10 MB')
    expect(recipeImageFileError({ name: 'dish.gif', type: 'image/gif', size: 20 })).toContain('JPEG, PNG or WebP')
  })
})
