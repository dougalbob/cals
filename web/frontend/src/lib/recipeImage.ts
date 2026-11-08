export const RECIPE_IMAGE_MAX_BYTES = 10 * 1024 * 1024

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const SUPPORTED_IMAGE_EXTENSIONS = /\.(jpe?g|png|webp)$/i

/** Client-side guidance only; the server decodes and validates every upload. */
export function recipeImageFileError(file: Pick<File, 'name' | 'size' | 'type'>): string | null {
  if (file.size <= 0) return 'The selected image is empty.'
  if (file.size > RECIPE_IMAGE_MAX_BYTES) return 'Choose an image no larger than 10 MB.'

  const hasSupportedType = SUPPORTED_IMAGE_TYPES.has(file.type)
  const hasSupportedExtension = SUPPORTED_IMAGE_EXTENSIONS.test(file.name)
  if (!hasSupportedType && !(file.type === '' && hasSupportedExtension)) {
    return 'Choose a JPEG, PNG or WebP image.'
  }

  return null
}
