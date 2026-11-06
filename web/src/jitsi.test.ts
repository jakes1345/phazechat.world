import { describe, it, expect } from 'vitest'
import { jitsiCallUrl, toolbarFor, safeRoom } from './jitsi'

function config(url: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const part of url.split('#')[1].split('&')) {
    const [k, v] = part.split('=')
    out[k.replace(/^config\./, '')] = JSON.parse(decodeURIComponent(v))
  }
  return out
}

describe('era call controls', () => {
  it('offers screen sharing only from the second era', () => {
    expect(toolbarFor({ theme: 'skype3', kind: 'video', group: false })).not.toContain('desktop')
    expect(toolbarFor({ theme: 'skype4', kind: 'video', group: false })).toContain('desktop')
  })

  it('keeps group calls voice-only before the group video era', () => {
    expect(toolbarFor({ theme: 'skype4', kind: 'video', group: true })).not.toContain('camera')
    expect(config(jitsiCallUrl('r', { theme: 'skype4', kind: 'video', group: true })).startAudioOnly).toBe(true)
    expect(toolbarFor({ theme: 'skype5', kind: 'video', group: true })).toContain('camera')
  })

  it('starts audio calls with the camera off and video calls with it on', () => {
    expect(config(jitsiCallUrl('r', { theme: 'skype7', kind: 'audio', group: false })).startWithVideoMuted).toBe(true)
    expect(config(jitsiCallUrl('r', { theme: 'skype7', kind: 'video', group: false })).startWithVideoMuted).toBe(false)
  })

  it('keeps the room name to a safe path segment', () => {
    expect(safeRoom('a/b c?d')).toBe('a-b-c-d')
    expect(jitsiCallUrl('x/y', { theme: 'skype8', kind: 'video', group: false })).toMatch(/^https:\/\/meet\.jit\.si\/x-y#/)
  })
})
