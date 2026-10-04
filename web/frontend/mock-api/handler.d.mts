/**
 * Types for the fixture API, so TypeScript can check the test that drives
 * components against it. Mirrors handler.mjs's `handle()` contract.
 */
export interface FixtureResponse {
  status: number
  body: unknown
  contentType?: string
  headers?: Record<string, string>
}

export function handle(
  method: string,
  url: URL,
  body: unknown,
  headers?: Record<string, string | string[] | undefined>,
): FixtureResponse | null
