import { decodePublicKeyField } from './e2ee'

const PINS_KEY = 'phaze_key_pins_v1'

export type PinRow = {
  /** The key messages are currently encrypted to. */
  fingerprint: string
  publicKeyB64: string
  /** Every fingerprint the user has trusted for this contact, one per
   *  device they use (each web browser and app install has its own key). */
  trusted?: string[]
}

/** True when `fp` is a key the user already trusts for this contact. */
export function isTrusted(row: PinRow | undefined, fp: string): boolean {
  return !!row && (row.fingerprint === fp || !!row.trusted?.includes(fp))
}

/** Makes `pk` the contact's current key and adds it to the trusted set. */
export function trustKey(row: PinRow | undefined, fp: string, publicKeyB64: string): PinRow {
  const trusted = new Set(row?.trusted ?? [])
  if (row) trusted.add(row.fingerprint)
  trusted.add(fp)
  return { fingerprint: fp, publicKeyB64, trusted: [...trusted] }
}

export function loadPins(): Record<string, PinRow> {
  try {
    const raw = localStorage.getItem(PINS_KEY)
    if (!raw) return {}
    const o = JSON.parse(raw) as Record<string, PinRow>
    return o && typeof o === 'object' ? o : {}
  } catch {
    return {}
  }
}

export function savePins(p: Record<string, PinRow>) {
  localStorage.setItem(PINS_KEY, JSON.stringify(p))
}

/**
 * Public keys of contacts pinned on this device, so encryption works right
 * after a reload or when the contact is offline and can't answer a
 * key_request.
 */
export function pinnedPublicKeys(p: Record<string, PinRow>): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {}
  for (const [peer, row] of Object.entries(p)) {
    const pk = row && decodePublicKeyField(row.publicKeyB64)
    if (pk) out[peer] = pk
  }
  return out
}
