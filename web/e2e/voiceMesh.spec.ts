import { test, expect } from '@playwright/test'
import { build } from 'vite'
import { fileURLToPath } from 'node:url'

/**
 * Voice rooms in a real browser.
 *
 * Three VoiceMesh instances run in one page with Chromium's fake microphone
 * and camera, and a tiny in-page router stands in for the server's
 * voice_peers / voice_signal relay. This exercises the actual WebRTC
 * negotiation: who offers, transceivers on the answering side, ICE, and
 * switching the camera on mid-call without a new offer.
 */

const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH

test.use({
  launchOptions: {
    ...(chromiumPath ? { executablePath: chromiumPath } : {}),
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
  permissions: ['microphone', 'camera'],
})

let bundle = ''

test.beforeAll(async () => {
  const entry = fileURLToPath(new URL('../src/voiceMesh.ts', import.meta.url))
  const out = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: { entry, name: 'VoiceMeshLib', formats: ['iife'], fileName: () => 'voiceMesh.js' },
    },
  })
  const results = Array.isArray(out) ? out : [out]
  for (const r of results) {
    if (!('output' in r)) continue
    for (const chunk of r.output) {
      if (chunk.type === 'chunk') bundle += chunk.code
    }
  }
  expect(bundle.length).toBeGreaterThan(0)
})

test('three people connect, hear each other and see a camera turned on', async ({ page }) => {
  await page.goto('/')
  await page.addScriptTag({ content: bundle })

  const ok = await page.evaluate(async () => {
    type Mesh = {
      start(): Promise<boolean>
      setPeers(p: string[]): void
      handle(from: string, body: string, sdp?: string, candidate?: string): Promise<void>
      setCamera(on: boolean): Promise<void>
      peerViews(): { name: string; stream: MediaStream; state: { mic: boolean; cam: boolean; screen: boolean }; connection: string }[]
      close(): void
    }
    const lib = (window as unknown as { VoiceMeshLib: { VoiceMesh: new (me: string, ice: RTCIceServer[], ev: unknown) => Mesh } }).VoiceMeshLib
    const names = ['alice', 'bob', 'carol']
    const meshes: Record<string, Mesh> = {}
    for (const me of names) {
      meshes[me] = new lib.VoiceMesh(me, [], {
        // Stand-in for the server relay: deliver straight to the recipient.
        signal: (s: { to: string; body: string; sdp?: string; candidate?: string }) => {
          setTimeout(() => { void meshes[s.to]?.handle(me, s.body, s.sdp, s.candidate) }, 0)
        },
        onChange: () => {},
        onError: (m: string) => { throw new Error(m) },
      })
    }
    for (const me of names) {
      if (!(await meshes[me].start())) return 'mic failed for ' + me
    }
    // The server sends everyone the full member list as people join.
    meshes.alice.setPeers(['alice'])
    meshes.alice.setPeers(['alice', 'bob'])
    meshes.bob.setPeers(['alice', 'bob'])
    for (const me of names) meshes[me].setPeers(names)

    const waitFor = async (cond: () => boolean, what: string) => {
      const until = Date.now() + 15000
      while (Date.now() < until) {
        if (cond()) return
        await new Promise((r) => setTimeout(r, 100))
      }
      throw new Error('timed out: ' + what)
    }

    await waitFor(() => names.every((n) => {
      const v = meshes[n].peerViews()
      return v.length === 2 && v.every((p) => p.connection === 'connected' && p.stream.getAudioTracks().length > 0)
    }), 'all pairs connected with audio')

    await meshes.carol.setCamera(true)
    await waitFor(() => ['alice', 'bob'].every((n) => {
      const c = meshes[n].peerViews().find((p) => p.name === 'carol')
      return !!c && c.state.cam && c.stream.getVideoTracks().some((t) => !t.muted)
    }), 'carol\'s camera reaches alice and bob')

    // Bob leaves: the others drop him.
    meshes.bob.close()
    meshes.alice.setPeers(['alice', 'carol'])
    meshes.carol.setPeers(['alice', 'carol'])
    if (meshes.alice.peerViews().map((p) => p.name).join() !== 'carol') return 'alice still lists bob'

    for (const n of names) meshes[n].close()
    return 'ok'
  })

  expect(ok).toBe('ok')
})
