// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { handle } from '../../mock-api/handler.mjs'
import { recipes, resetFixtures } from '../../mock-api/seed.mjs'

const url = (path: string) => new URL(path, 'http://localhost')

function upload(recipeId: number, file: { name: string; type: string; size: number } | null) {
  return handle('POST', url(`/api/recipes/${recipeId}/image`), {
    get: (name: string) => name === 'image' ? file : null,
  })
}

describe('fixture recipe image API', () => {
  beforeEach(() => {
    resetFixtures()
    handle('POST', url('/api/_test/reset'), null)
  })

  it('accepts a supported file, updates the recipe version and serves both image routes', () => {
    const recipe = recipes[0]!
    const result = upload(recipe.id, { name: 'dinner.webp', type: 'image/webp', size: 2048 })

    expect(result?.status).toBe(200)
    expect(result?.body).toMatchObject({ filename: expect.stringMatching(/^v_[a-f0-9]{32}$/) })
    expect(recipe.image_filename).toMatch(/^v_[a-f0-9]{32}$/)
    expect(recipe.updated_at).toBe((result?.body as { updated_at: string }).updated_at)

    for (const imageType of ['original', 'thumb']) {
      const image = handle('GET', url(`/api/images/recipes/${recipe.id}/${imageType}`), null)
      expect(image).toMatchObject({ status: 200, contentType: 'image/svg+xml' })
      expect(image?.body).toContain('<svg')
    }
  })

  it('rejects missing, unsupported and over-limit files without changing the recipe', () => {
    const recipe = recipes[0]!
    const initialVersion = recipe.image_filename

    expect(upload(recipe.id, null)?.status).toBe(400)
    expect(upload(recipe.id, { name: 'dish.gif', type: 'image/gif', size: 128 })?.status).toBe(400)
    expect(upload(recipe.id, { name: 'huge.png', type: 'image/png', size: 10 * 1024 * 1024 + 1 })?.status).toBe(413)
    expect(recipe.image_filename).toBe(initialVersion)
  })
})
