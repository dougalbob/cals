/**
 * Read fixture API mutation bodies. JSON is returned as an object and a
 * multipart form is represented by the same small get(name) interface used by
 * the upload handler. File bytes are retained for realistic browser requests,
 * though the fixture only needs name, MIME type and size.
 */
export async function parseRequestBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks)
  if (raw.length === 0) return null

  const contentType = req.headers['content-type'] ?? ''
  if (/^multipart\/form-data\b/i.test(contentType)) {
    return parseMultipartForm(raw, contentType)
  }

  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    return undefined
  }
}

function parseMultipartForm(raw, contentType) {
  const boundaryMatch = contentType.match(/(?:^|;)\s*boundary=(?:"([^"]+)"|([^;\s]+))/i)
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2]
  if (!boundary) return undefined

  const delimiter = Buffer.from(`--${boundary}`)
  const nextPart = Buffer.from(`\r\n--${boundary}`)
  const headerEndMarker = Buffer.from('\r\n\r\n')
  const values = new Map()
  let cursor = 0

  while (cursor < raw.length) {
    const markerIndex = raw.indexOf(delimiter, cursor)
    if (markerIndex < 0) break
    let partStart = markerIndex + delimiter.length
    if (raw.subarray(partStart, partStart + 2).toString() === '--') break
    if (raw.subarray(partStart, partStart + 2).toString() === '\r\n') partStart += 2

    const headersEnd = raw.indexOf(headerEndMarker, partStart)
    if (headersEnd < 0) return undefined
    const headers = raw.subarray(partStart, headersEnd).toString('latin1')
    const contentStart = headersEnd + headerEndMarker.length
    const contentEnd = raw.indexOf(nextPart, contentStart)
    if (contentEnd < 0) return undefined

    const disposition = headers.match(/^content-disposition:\s*form-data;([^\r\n]*)/im)?.[1] ?? ''
    const name = disposition.match(/(?:^|;)\s*name="([^"]*)"/i)?.[1]
    if (name) {
      const filename = disposition.match(/(?:^|;)\s*filename="([^"]*)"/i)?.[1]
      const contentTypeValue = headers.match(/^content-type:\s*([^\r\n]+)/im)?.[1]?.trim() ?? ''
      const content = raw.subarray(contentStart, contentEnd)
      values.set(name, filename === undefined
        ? content.toString('utf8')
        : { name: filename, type: contentTypeValue, size: content.length, bytes: content })
    }

    cursor = contentEnd + 2
  }

  return { get: (name) => values.get(name) ?? null }
}
