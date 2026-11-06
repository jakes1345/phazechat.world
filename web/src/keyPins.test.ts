import { describe, expect, it } from 'vitest'
import { encodePublicKeyB64, generateKeyPair } from './e2ee'
import { pinnedPublicKeys } from './keyPins'

describe('pinnedPublicKeys', () => {
  it('restores pinned keys and skips broken rows', () => {
    const { publicKey } = generateKeyPair()
    const keys = pinnedPublicKeys({
      alice: { fingerprint: 'x', publicKeyB64: encodePublicKeyB64(publicKey) },
      broken: { fingerprint: 'y', publicKeyB64: 'not base64!!' },
    })
    expect(Object.keys(keys)).toEqual(['alice'])
    expect(Array.from(keys.alice)).toEqual(Array.from(publicKey))
  })
})
