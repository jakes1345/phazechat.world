import { test, expect } from '@playwright/test'

/**
 * Boot smoke tests.
 *
 * These exist because CI was fully green while the deployed site served a
 * blank page: react 19.2.8 shipped against react-dom 19.2.7, React refused to
 * mount, and nothing noticed. `npm ci` installed the mismatch faithfully, vite
 * bundled it happily, the unit tests never mounted React, and version skew
 * isn't a lint rule. Every check inspected the code; none of them ran it.
 *
 * So the bar here is deliberately low and deliberately end-to-end: load the
 * real built bundle in a real browser and prove the app actually starts. No
 * backend is required — an unreachable server still leaves a mounted app
 * sitting on its auth screen, which is exactly the signal we want. Anything
 * that stops React mounting at all fails these.
 */

test('the app mounts and renders its shell', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  await page.goto('/')

  // The root must actually receive children. A blank page is the failure
  // mode we're guarding: #root exists in index.html either way, so asserting
  // on the element is not enough — assert it was populated.
  const root = page.locator('#root')
  await expect(root).toBeAttached()
  await expect
    .poll(async () => root.evaluate((el) => el.childElementCount), {
      timeout: 15_000,
      message: 'React never mounted — #root stayed empty (blank page)',
    })
    .toBeGreaterThan(0)

  // The app shell carries its theme on the root element.
  await expect(page.locator('.app')).toBeAttached({ timeout: 15_000 })

  // A mount failure surfaces here first and with the clearest message, so
  // report it rather than letting a downstream selector time out vaguely.
  expect(pageErrors, `uncaught errors during boot:\n${pageErrors.join('\n')}`).toEqual([])
})

test('boots with a usable sign-in form', async ({ page }) => {
  await page.goto('/')
  // Not signed in and no reachable backend, so the auth screen is what should
  // render. Both fields present means the app got far enough to be usable.
  await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('input:not([type="password"])').first()).toBeVisible()
})

test('no console errors on a clean load', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    // Network failures are expected: no nexus server runs in CI, so the
    // WebSocket and /api calls legitimately fail. Those say nothing about
    // whether the app booted, which is all this test is asserting.
    if (/ERR_CONNECTION|Failed to load resource|WebSocket|net::/i.test(t)) return
    errors.push(t)
  })

  await page.goto('/')
  await expect(page.locator('.app')).toBeAttached({ timeout: 15_000 })

  expect(errors, `console errors on boot:\n${errors.join('\n')}`).toEqual([])
})
