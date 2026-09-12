import { defineConfig, devices } from '@playwright/test'

/**
 * Runs the smoke suite against the real production bundle rather than the dev
 * server, so what CI exercises is what actually ships (dev-mode React is more
 * forgiving than the built output).
 *
 * PLAYWRIGHT_CHROMIUM_PATH lets a preinstalled browser be used where the
 * image's Chromium build doesn't match the npm package's expected revision —
 * common in sandboxes and prebaked CI images. Unset, Playwright uses its own.
 */
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 30_000,

  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    // Bind explicitly to 127.0.0.1. `vite preview` otherwise listens on
    // "localhost", which on dual-stack CI runners resolves to ::1 first — the
    // server comes up fine but Playwright's 127.0.0.1 poll never connects and
    // the run dies on "Timed out waiting 120000ms from config.webServer".
    //
    // Invoked via npx rather than `npm run preview -- …` so the flags reach
    // vite directly instead of through npm's argument forwarding.
    command: 'npx vite preview --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
