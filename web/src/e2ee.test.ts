import { describe, expect, it } from 'vitest'
import {
  decryptFromPeer,
  decodePublicKeyField,
  encodePublicKeyB64,
  encryptForPeer,
  generateKeyPair,
  isEncryptedBody,
} from './e2ee'

describe('e2ee', () => {
  it('roundtrips NaCl box between two keypairs', () => {
    const alice = generateKeyPair()
    const bob = generateKeyPair()
    const cipher = encryptForPeer('hello-μniverse', bob.publicKey, alice.secretKey)
    expect(cipher.startsWith('E2EE:')).toBe(true)
    const plain = decryptFromPeer(cipher, alice.publicKey, bob.secretKey)
    expect(plain).toBe('hello-μniverse')
  })

  it('decryptFromPeer leaves plaintext unchanged', () => {
    const alice = generateKeyPair()
    const bob = generateKeyPair()
    expect(decryptFromPeer('plain', alice.publicKey, bob.secretKey)).toBe('plain')
  })

  it('decodePublicKeyField accepts base64 from encodePublicKeyB64', () => {
    const { publicKey } = generateKeyPair()
    const b64 = encodePublicKeyB64(publicKey)
    const decoded = decodePublicKeyField(b64)
    expect(decoded).not.toBeNull()
    expect(decoded!.length).toBe(32)
    expect(Array.from(decoded!)).toEqual(Array.from(publicKey))
  })

  it('decodePublicKeyField rejects bad inputs', () => {
    expect(decodePublicKeyField(undefined)).toBeNull()
    expect(decodePublicKeyField('not-valid-base64!!!')).toBeNull()
    expect(decodePublicKeyField([])).toBeNull()
    expect(decodePublicKeyField(Array.from({ length: 31 }, (_, i) => i))).toBeNull()
  })

  it('decryptFromPeer returns null for ciphertext it cannot open', () => {
    const alice = generateKeyPair()
    const bob = generateKeyPair()
    const eve = generateKeyPair()
    const cipher = encryptForPeer('secret', bob.publicKey, alice.secretKey)
    expect(decryptFromPeer(cipher, eve.publicKey, bob.secretKey)).toBeNull()
    expect(decryptFromPeer('E2EE:zz', alice.publicKey, bob.secretKey)).toBeNull()
    expect(decryptFromPeer('E2EE:abc', alice.publicKey, bob.secretKey)).toBeNull()
    expect(decryptFromPeer('E2EE:' + '00'.repeat(30), alice.publicKey, bob.secretKey)).toBeNull()
  })

  it('both sides of a conversation open each other\'s messages with the shared key', () => {
    const alice = generateKeyPair()
    const bob = generateKeyPair()
    const fromAlice = encryptForPeer('mine', bob.publicKey, alice.secretKey)
    // Alice re-reading her own sent message from server history.
    expect(decryptFromPeer(fromAlice, bob.publicKey, alice.secretKey)).toBe('mine')
  })

  it('isEncryptedBody only matches the E2EE: prefix', () => {
    expect(isEncryptedBody('E2EE:00')).toBe(true)
    expect(isEncryptedBody('hello')).toBe(false)
    expect(isEncryptedBody('')).toBe(false)
    expect(isEncryptedBody(undefined)).toBe(false)
  })
})
