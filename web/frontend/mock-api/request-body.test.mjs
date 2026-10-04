import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { parseRequestBody } from './request-body.mjs'

function request(contentType, body) {
  const req = Readable.from([Buffer.from(body)])
  req.headers = { 'content-type': contentType }
  return req
}

describe('fixture mutation request-body parser', () => {
  it('parses a multipart image file while preserving its binary bytes', async () => {
    const boundary = 'fixture-boundary-123'
    const prefix = `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="meal.png"\r\nContent-Type: image/png\r\n\r\n`
    const suffix = `\r\n--${boundary}--\r\n`
    const fileBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff])
    const parsed = await parseRequestBody(request(
      `multipart/form-data; boundary=${boundary}`,
      Buffer.concat([Buffer.from(prefix), fileBytes, Buffer.from(suffix)]),
    ))

    const file = parsed.get('image')
    expect(file).toMatchObject({ name: 'meal.png', type: 'image/png', size: fileBytes.length })
    expect(file.bytes).toEqual(fileBytes)
  })

  it('continues to parse JSON mutations and rejects malformed JSON', async () => {
    await expect(parseRequestBody(request('application/json', '{"ok":true}'))).resolves.toEqual({ ok: true })
    await expect(parseRequestBody(request('application/json', '{broken'))).resolves.toBeUndefined()
  })
})
