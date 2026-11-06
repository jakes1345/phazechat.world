import { describe, expect, it } from 'vitest'
import { encodePublicKeyB64, generateKeyPair } from './e2ee'
import { isTrusted, pinnedPublicKeys, trustKey } from './keyPins'

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

describe('trusted keys per contact', () => {
  it('remembers every key the user trusted, one per device', () => {
    let row = trustKey(undefined, 'aaaa', 'A')
    expect(isTrusted(row, 'aaaa')).toBe(true)
    expect(isTrusted(row, 'bbbb')).toBe(false)
    row = trustKey(row, 'bbbb', 'B')
    expect(row.fingerprint).toBe('bbbb')
    expect(isTrusted(row, 'aaaa')).toBe(true)
    expect(isTrusted(row, 'bbbb')).toBe(true)
    // Switching back to a trusted device keeps both trusted.
    row = trustKey(row, 'aaaa', 'A')
    expect(row.trusted?.sort()).toEqual(['aaaa', 'bbbb'])
    expect(isTrusted(undefined, 'aaaa')).toBe(false)
  })
})
