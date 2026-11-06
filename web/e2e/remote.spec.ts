import { test, expect, type Browser } from '@playwright/test'

/**
 * Remote screen sessions against a real Nexus server (see e2ee.spec.ts for
 * setup). Needs PHAZE_E2E_URL; skipped otherwise. Fake capture devices stand
 * in for the screen.
 */

const BASE = process.env.PHAZE_E2E_URL
const PASSWORD = process.env.PHAZE_E2E_PASSWORD || 'test1234'
const HOST = process.env.PHAZE_E2E_USER_A || 'alice'
const VIEWER = process.env.PHAZE_E2E_USER_B || 'bob'
const OUTSIDER = process.env.PHAZE_E2E_USER_C || 'carol'

test.skip(!BASE, 'PHAZE_E2E_URL not set; needs a running Nexus server')
test.describe.configure({ mode: 'serial' })
test.use({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--auto-select-desktop-capture-source=Entire screen'],
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}),
  },
})

async function openRemote(browser: Browser, user: string) {
  const context = await browser.newContext()
  // Remote sessions are a Phaze 6+ feature.
  await context.addInitScript(() => localStorage.setItem('phaze_theme_v1', 'skype8'))
  // Keep a handle on the app's socket so a test can send raw frames.
  await context.addInitScript(() => {
    const Orig = window.WebSocket
    window.WebSocket = class extends Orig {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols)
        ;(window as unknown as { __phazeWs?: WebSocket }).__phazeWs = this
      }
    }
  })
  const page = await context.newPage()
  const frames: { type: string; recipient?: string }[] = []
  page.on('websocket', (ws) => ws.on('framereceived', (f) => {
    try { const m = JSON.parse(String(f.payload)); if (String(m.type).startsWith('remote_')) frames.push(m) } catch { /* not JSON */ }
  }))
  await page.goto(BASE!)
  await page.fill('input[placeholder="Username"]', user)
  await page.fill('input[type="password"][placeholder="Password"]', PASSWORD)
  await page.click('button[type="submit"]:has-text("Sign in")')
  await expect(page.locator('.friend-row').first()).toBeVisible({ timeout: 15_000 })
  const later = page.locator('button', { hasText: 'Later' })
  if (await later.isVisible({ timeout: 1_500 }).catch(() => false)) await later.click()
  await page.locator('button[title="Remote Control"]:visible').first().click()
  return { page, frames, close: () => context.close() }
}

test('a viewer with the code connects, and the host stays shared', async ({ browser }) => {
  const host = await openRemote(browser, HOST)
  const viewer = await openRemote(browser, VIEWER)
  try {
    await host.page.locator('button', { hasText: 'Start sharing' }).click()
    const code = (await host.page.locator('.rc-code-value').textContent({ timeout: 10_000 }))?.trim() || ''
    expect(code).toMatch(/^\d{6}$/)

    await viewer.page.fill('input.rc-code-input', code)
    await viewer.page.locator('button', { hasText: 'Connect' }).click()
    // The host connects to this viewer and keeps sharing (the old cleanup
    // effect tore the connection down as soon as a viewer arrived).
    await expect(host.page.locator('.rc-code-hint', { hasText: `Connected to ${VIEWER}` })).toBeVisible({ timeout: 20_000 })
    await host.page.waitForTimeout(2_000)
    await expect(host.page.locator('.rc-code-hint', { hasText: `Connected to ${VIEWER}` })).toBeVisible()
  } finally {
    await viewer.close()
    await host.close()
  }
})

test('without the code, an offer to the host is never relayed', async ({ browser }) => {
  const host = await openRemote(browser, HOST)
  const outsider = await openRemote(browser, OUTSIDER)
  try {
    await host.page.locator('button', { hasText: 'Start sharing' }).click()
    await expect(host.page.locator('.rc-code-value')).toHaveText(/^\d{6}$/, { timeout: 10_000 })
    // Send a raw offer straight over the outsider's socket, skipping the code.
    await outsider.page.evaluate((h) => {
      const ws = (window as unknown as { __phazeWs?: WebSocket }).__phazeWs
      ws?.send(JSON.stringify({ type: 'remote_offer', recipient: h, sdp: 'v=0' }))
    }, HOST)
    await host.page.waitForTimeout(2_000)
    expect(host.frames.filter((f) => f.type === 'remote_offer')).toHaveLength(0)
  } finally {
    await outsider.close()
    await host.close()
  }
})
