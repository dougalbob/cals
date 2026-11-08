import type { Plugin } from 'vite'

/** Serves the fixture API (mock-api/handler.mjs) as same-origin /api/* routes. */
export function fixtureApi(): Plugin
