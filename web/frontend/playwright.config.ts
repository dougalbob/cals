import { defineConfig, devices } from '@playwright/test'

/**
 * Real-browser end-to-end suite for the React app.
 *
 * WHY THIS EXISTS
 * Vitest + jsdom proves component logic, but not layout: the mobile Diary Edit
 * sheet's fixed footer, the hydration controls' placement, or a phone-width tap
 * target can all pass in jsdom and still be broken in a browser. This suite is
 * deliberately small and covers only the highest-value phone journeys.
 *
 * WHAT IT RUNS AGAINST
 * The pre-built React bundle served by `serve-preview.mjs`, with the fixture
 * API (mock-api/handler.mjs) mounted in-process. That keeps it hermetic — no
 * Go server, no SQLite, no Cloudflare Access, no household data — while still
 * exercising the real built bundle, real CSS and a real Chromium.
 *
 *   npm run build:preview     # required once after frontend source changes
 *   npm run test:e2e          # does both
 *
 * Point it at another server with E2E_BASE_URL (the tests use relative URLs,
 * so anything serving the app + /api/* works). In the Arena sandbox the
 * Playwright browser download is blocked; scripts/run-playwright-in-sandbox.sh
 * supplies a Chromium binary via E2E_CHROMIUM_PATH instead.
 *
 * The fixture state is shared by every request to one server process, so the
 * suite runs with a single worker and each spec resets the fixtures first.
 */

const PORT = Number(process.env.E2E_PORT ?? 5273)
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  // The fixture API keeps its data in the server process; parallel specs would
  // stomp on each other's mutations.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // One retry in CI only: the suite is deterministic, so a retry flake is worth
  // seeing rather than hiding, but it also protects the milestone run from a
  // one-off timeout while still uploading the trace from the first attempt.
  retries: process.env.CI ? 1 : 0,
  // Keep the timeout tight so a hang fails the run instead of burning CI time.
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: process.env.CI
    ? [
        ['list'],
        ['github'],
        ['html', { open: 'never' }],
        ['json', { outputFile: 'test-results/results.json' }],
      ]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    // The fixture data is generated from the server process's local date and the
    // app reads the browser's local date, so pin both ends to UTC: a runner in
    // another timezone can otherwise see "today" as two different days.
    timezoneId: 'UTC',
    // Playwright normally finds its own browser. In the Arena sandbox the
    // browser CDN is unreachable, so the runner script points it at an
    // npm-fetched Chromium instead.
    launchOptions: process.env.E2E_CHROMIUM_PATH
      ? {
          executablePath: process.env.E2E_CHROMIUM_PATH,
          // The npm-fetched build is a serverless Chromium: no sandbox
          // namespaces and a small /dev/shm. Single-process mode (which that
          // package recommends) is deliberately not used — it crashed
          // Playwright between tests here, and is unnecessary outside Lambda.
          args: ['--no-sandbox', '--disable-dev-shm-usage'],
        }
      : {},
    // Artifacts on failure are the whole point of a browser test run in CI.
    // Video needs Playwright's bundled ffmpeg, which the sandbox cannot fetch;
    // scripts/run-playwright-in-sandbox.sh sets E2E_NO_VIDEO=1 (traces and
    // screenshots still cover a failure there).
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.E2E_NO_VIDEO ? 'off' : 'retain-on-failure',
    actionTimeout: 10_000,
  },

  projects: [
    {
      // The primary target: a phone-sized viewport with touch, where the
      // reported layout bugs actually happen.
      name: 'phone',
      // Phone-sized is the default for every spec except the @desktop ones.
      grepInvert: /@desktop/,
      use: { ...devices['Pixel 7'] },
    },
    {
      // A thin desktop smoke project so a phone-only fix cannot silently break
      // the desktop dialog/card layout. Only specs tagged @desktop run here.
      name: 'desktop',
      grep: /@desktop/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Start the fixture-API server ourselves unless an external base URL is given.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'node serve-preview.mjs',
        url: `${BASE_URL}/api/version`,
        reuseExistingServer: false,
        timeout: 30_000,
        env: { PORT: String(PORT), HOST: '127.0.0.1', TZ: 'UTC' },
      },
})
