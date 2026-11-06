import { test, expect, type Browser, type Page } from '@playwright/test'

/**
 * End-to-end encryption checks against a real Nexus server.
 *
 * Skipped unless PHAZE_E2E_URL points at a running server serving the web
 * bundle, e.g.
 *
 *   PHAZE_DEVICE_VERIFICATION=0 PORT=18080 DB_PATH=/tmp/e2e.db \
 *     PHAZE_WEB_DIR=../web/dist go run .            # in nexus_server/
 *   go run ./cmd/seed-admin -db /tmp/e2e.db -username alice -password test1234 -email alice@example.com
 *   (same for bob and carol; make alice friends with bob and with carol)
 *   PHAZE_E2E_URL=http://127.0.0.1:18080/web/ npx playwright test e2ee
 *
 * What goes over the WebSocket is the thing under test, so assertions read
 * outgoing frames rather than the UI: a message the UI shows as sent but that
 * left the browser in plaintext is exactly the failure being guarded.
 *
 * Each test guards a bug that shipped once: plaintext after a reload,
 * undecrypted live edits, silent plaintext to contacts without a key, and a
 * CSP that blocked the Jitsi call iframe.
 */

const BASE = process.env.PHAZE_E2E_URL
const PASSWORD = process.env.PHAZE_E2E_PASSWORD || 'test1234'
const ALICE = process.env.PHAZE_E2E_USER_A || 'alice'
const BOB = process.env.PHAZE_E2E_USER_B || 'bob'
// A friend of ALICE who is never signed in during these tests.
const CAROL = process.env.PHAZE_E2E_USER_C || 'carol'

test.skip(!BASE, 'PHAZE_E2E_URL not set; needs a running Nexus server')
test.describe.configure({ mode: 'serial' })

type Session = { page: Page; sentDMs: { recipient: string; body: string; type: string }[]; close: () => Promise<void> }

async function signIn(browser: Browser, user: string, opts: { keepNotices?: boolean } = {}): Promise<Session> {
  // Fresh context = fresh localStorage = a brand-new NaCl identity and no pins.
  const context = await browser.newContext()
  const page = await context.newPage()
  const sentDMs: Session['sentDMs'] = []
  page.on('websocket', (ws) => {
    ws.on('framesent', (f) => {
      try {
        const m = JSON.parse(String(f.payload))
        if (m.type === 'msg' || m.type === 'msg_edit') sentDMs.push({ recipient: m.recipient, body: m.body, type: m.type })
      } catch { /* not JSON */ }
    })
  })
  await page.goto(BASE!)
  await page.fill('input[placeholder="Username"]', user)
  await page.fill('input[type="password"][placeholder="Password"]', PASSWORD)
  await page.click('button[type="submit"]:has-text("Sign in")')
  await expect(page.locator('.friend-row').first()).toBeVisible({ timeout: 15_000 })
  if (!opts.keepNotices) {
    // A fresh browser for an account with a key backup is offered a restore.
    const later = page.locator('button', { hasText: 'Later' })
    if (await later.isVisible({ timeout: 1_500 }).catch(() => false)) await later.click()
  }
  return { page, sentDMs, close: () => context.close() }
}

async function openChat(page: Page, peer: string) {
  await page.locator('.friend-row', { hasText: peer }).first().click()
}

function composer(page: Page) {
  return page.locator('input[placeholder^="Write a message"], input[placeholder^="Edit message"]')
}

async function send(page: Page, text: string) {
  await composer(page).fill(text)
  await composer(page).press('Enter')
}

function uniq(label: string) {
  return `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

test('DM between online friends is ciphertext on the wire and plaintext for the peer', async ({ browser }) => {
  const a = await signIn(browser, ALICE)
  const b = await signIn(browser, BOB)
  try {
    await openChat(b.page, ALICE)
    await openChat(a.page, BOB)
    // The lock in the placeholder means the peer key arrived.
    await expect(composer(a.page)).toHaveAttribute('placeholder', /🔒/, { timeout: 10_000 })

    const text = uniq('hello bob')
    await send(a.page, text)

    await expect.poll(() => a.sentDMs.filter((m) => m.recipient === BOB).length).toBe(1)
    const wire = a.sentDMs.find((m) => m.recipient === BOB)!
    expect(wire.body.startsWith('E2EE:')).toBe(true)
    expect(wire.body).not.toContain(text)

    await expect(b.page.locator('.bubble-text', { hasText: text })).toBeVisible({ timeout: 10_000 })
    await expect(b.page.locator('.bubble-text', { hasText: 'E2EE:' })).toHaveCount(0)
  } finally {
    await a.close()
    await b.close()
  }
})

test('an edited DM reaches the peer decrypted', async ({ browser }) => {
  const a = await signIn(browser, ALICE)
  const b = await signIn(browser, BOB)
  try {
    await openChat(b.page, ALICE)
    await openChat(a.page, BOB)
    await expect(composer(a.page)).toHaveAttribute('placeholder', /🔒/, { timeout: 10_000 })
    const original = uniq('before edit')
    await send(a.page, original)
    await expect(b.page.locator('.bubble-text', { hasText: original })).toBeVisible({ timeout: 10_000 })

    const mine = a.page.locator('.bubble-row.me', { hasText: original })
    await mine.locator('.action-btn[title="Edit"]').evaluate((el: HTMLElement) => el.click())
    const edited = uniq('after edit')
    await send(a.page, edited)

    await expect(b.page.locator('.bubble-text', { hasText: edited })).toBeVisible({ timeout: 5_000 })
  } finally {
    await a.close()
    await b.close()
  }
})

test('a reload keeps encrypting to a pinned peer who is now offline', async ({ browser }) => {
  const a = await signIn(browser, ALICE)
  const b = await signIn(browser, BOB)
  try {
    await openChat(b.page, ALICE)
    await openChat(a.page, BOB)
    await expect(composer(a.page)).toHaveAttribute('placeholder', /🔒/, { timeout: 10_000 })
    await b.close()

    await a.page.reload()
    await expect(a.page.locator('.friend-row').first()).toBeVisible({ timeout: 15_000 })
    await openChat(a.page, BOB)
    a.page.on('dialog', (d) => void d.dismiss())
    const text = uniq('while bob is away')
    a.sentDMs.length = 0
    await send(a.page, text)

    await expect.poll(() => a.sentDMs.length, { timeout: 3_000 }).toBe(1)
    expect(a.sentDMs[0].body.startsWith('E2EE:')).toBe(true)
  } finally {
    await a.close()
  }
})

test('sending to a contact with no known key asks first, and cancelling sends nothing', async ({ browser }) => {
  const a = await signIn(browser, ALICE)
  try {
    await openChat(a.page, CAROL)
    const dialogs: string[] = []
    a.page.on('dialog', (d) => { dialogs.push(d.message()); void d.dismiss() })
    await send(a.page, uniq('to carol'))
    await expect.poll(() => dialogs.length, { timeout: 3_000 }).toBe(1)
    expect(a.sentDMs).toHaveLength(0)
  } finally {
    await a.close()
  }
})

test('the web CSP allows the Jitsi call iframe', async ({ request }) => {
  const res = await request.get(BASE!)
  const csp = res.headers()['content-security-policy'] || ''
  const frameSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('frame-src')) || ''
  expect(frameSrc).toContain('https://meet.jit.si')
})

test('a key backup restores the same identity on a fresh browser', async ({ browser }) => {
  test.setTimeout(90_000)
  const pin = 'restore-me-123'
  const a = await signIn(browser, ALICE)
  let original: string
  try {
    original = await a.page.evaluate(() => localStorage.getItem('phaze_nacl_keys_v1') || '')
    await a.page.locator('button[title="Settings"]:visible').first().click()
    await a.page.locator('.settings-tab', { hasText: 'Backup & Devices' }).click()
    await a.page.fill('input[placeholder^="Recovery PIN ("]', pin)
    await a.page.fill('input[placeholder="Confirm PIN"]', pin)
    await a.page.locator('button', { hasText: 'Save backup' }).click()
    await expect(a.page.locator('.settings-msg.ok', { hasText: 'Backup saved' })).toBeVisible({ timeout: 30_000 })
  } finally {
    await a.close()
  }

  // A brand-new browser makes a new identity, then restores the backed-up one.
  const fresh = await signIn(browser, ALICE, { keepNotices: true })
  try {
    const before = await fresh.page.evaluate(() => localStorage.getItem('phaze_nacl_keys_v1') || '')
    expect(before).not.toBe(original)
    fresh.page.on('dialog', (d) => void d.accept())
    // The app points a new browser at the existing backup.
    await fresh.page.locator('button', { hasText: 'Restore now' }).click({ timeout: 15_000 })
    await fresh.page.fill('input[placeholder="Recovery PIN"]', 'wrong-pin-0000')
    await fresh.page.locator('button', { hasText: 'Restore keys' }).click()
    await expect(fresh.page.locator('.settings-msg.err', { hasText: 'Incorrect PIN' })).toBeVisible({ timeout: 30_000 })
    await fresh.page.fill('input[placeholder="Recovery PIN"]', pin)
    await fresh.page.locator('button', { hasText: 'Restore keys' }).click()
    await expect(fresh.page.locator('.settings-msg.ok', { hasText: 'Keys restored' })).toBeVisible({ timeout: 30_000 })
    const after = await fresh.page.evaluate(() => localStorage.getItem('phaze_nacl_keys_v1') || '')
    expect(after).toBe(original)
  } finally {
    await fresh.close()
  }
})

test('when a contact reinstalls, trusting their new key lets them read new messages', async ({ browser }) => {
  // alice pins bob's first key.
  const a = await signIn(browser, ALICE)
  let b = await signIn(browser, BOB)
  try {
    await openChat(b.page, ALICE)
    await openChat(a.page, BOB)
    await expect(composer(a.page)).toHaveAttribute('placeholder', /🔒/, { timeout: 10_000 })
    await b.close()

    // bob comes back on a fresh browser: a new identity.
    b = await signIn(browser, BOB)
    await openChat(b.page, ALICE)
    await a.page.reload()
    await expect(a.page.locator('.friend-row').first()).toBeVisible({ timeout: 15_000 })
    await openChat(a.page, BOB)

    const dialogs: string[] = []
    a.page.on('dialog', (d) => { dialogs.push(d.message()); void d.accept() })
    const text = uniq('after bob reinstalled')
    a.sentDMs.length = 0
    // Give alice's key_request time to bring back bob's new key.
    await expect.poll(async () => {
      await send(a.page, text)
      return a.sentDMs.length
    }, { timeout: 10_000, intervals: [1_500] }).toBeGreaterThan(0)
    expect(dialogs.some((m) => m.includes('encryption key changed'))).toBe(true)
    expect(a.sentDMs[0].body.startsWith('E2EE:')).toBe(true)
    await expect(b.page.locator('.bubble-text', { hasText: text }).first()).toBeVisible({ timeout: 10_000 })
  } finally {
    await a.close()
    await b.close()
  }
})

test('a contact on two devices is confirmed once, not on every chat open', async ({ browser }) => {
  const a = await signIn(browser, ALICE)
  const b1 = await signIn(browser, BOB)
  const b2 = await signIn(browser, BOB)
  try {
    const dialogs: string[] = []
    a.page.on('dialog', (d) => { dialogs.push(d.message()); void d.accept() })
    await openChat(a.page, BOB)
    await expect(composer(a.page)).toHaveAttribute('placeholder', /🔒/, { timeout: 10_000 })
    await a.page.waitForTimeout(1_500) // both of bob's devices answer
    await send(a.page, uniq('first'))
    const asked = dialogs.length
    expect(asked).toBeLessThanOrEqual(1)

    // Reopen the chat a few times: both of bob's keys are trusted now.
    for (let i = 0; i < 3; i++) {
      await a.page.reload()
      await expect(a.page.locator('.friend-row').first()).toBeVisible({ timeout: 15_000 })
      await openChat(a.page, BOB)
      await a.page.waitForTimeout(1_500)
      await send(a.page, uniq(`again ${i}`))
    }
    expect(dialogs.length).toBe(asked)
  } finally {
    await a.close()
    await b1.close()
    await b2.close()
  }
})
