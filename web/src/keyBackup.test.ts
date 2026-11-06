import { describe, expect, it } from 'vitest'
import { generateKeyPair } from './e2ee'
import { decryptKeypair, encryptKeypair, MIN_PIN_LENGTH } from './keyBackup'

describe('key backup', () => {
  it('round-trips the keypair with the right PIN', async () => {
    const kp = generateKeyPair()
    const blob = await encryptKeypair(kp.publicKey, kp.secretKey, 'correct horse')
    const back = await decryptKeypair(blob, 'correct horse')
    expect(Array.from(back.secretKey)).toEqual(Array.from(kp.secretKey))
    await expect(decryptKeypair(blob, 'wrong horse!')).rejects.toThrow('Incorrect PIN')
  }, 30_000)

  it('refuses short PINs', async () => {
    const kp = generateKeyPair()
    await expect(encryptKeypair(kp.publicKey, kp.secretKey, 'x'.repeat(MIN_PIN_LENGTH - 1))).rejects.toThrow()
  })

  it('refuses a backup whose iteration count was lowered', async () => {
    const kp = generateKeyPair()
    const blob = await encryptKeypair(kp.publicKey, kp.secretKey, 'correct horse')
    await expect(decryptKeypair({ ...blob, iterations: 1000 }, 'correct horse')).rejects.toThrow('unsafe')
  }, 30_000)
})
