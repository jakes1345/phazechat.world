import { describe, expect, it } from 'vitest'
import { diffPeers, isOfferer, parseMediaState } from './voiceMesh'

describe('voice mesh', () => {
  it('picks exactly one offerer per pair', () => {
    const names = ['alice', 'bob', 'carol', 'Zed']
    for (const a of names) {
      for (const b of names) {
        if (a === b) continue
        expect(isOfferer(a, b)).not.toBe(isOfferer(b, a))
      }
    }
  })

  it('diffs the member list against open connections, ignoring yourself', () => {
    expect(diffPeers('me', ['bob', 'dave'], ['me', 'carol', 'bob', 'alice'])).toEqual({
      add: ['alice', 'carol'],
      remove: ['dave'],
    })
    expect(diffPeers('me', [], ['me'])).toEqual({ add: [], remove: [] })
  })

  it('reads media state and defaults safely', () => {
    expect(parseMediaState('{"mic":false,"cam":true,"screen":false}')).toEqual({ mic: false, cam: true, screen: false })
    expect(parseMediaState('{}')).toEqual({ mic: true, cam: false, screen: false })
    expect(parseMediaState('not json')).toBeNull()
    expect(parseMediaState(undefined)).toBeNull()
  })
})
