import { describe, expect, it } from 'vitest'
import { offlineSentAt, REPORT_REASONS } from './reportReasons'

describe('offlineSentAt', () => {
  it('reads SQLite UTC timestamps', () => {
    expect(offlineSentAt('offline:2026-11-06 22:15:03')).toBe(Date.UTC(2026, 10, 6, 22, 15, 3))
  })
  it('accepts RFC 3339 too', () => {
    expect(offlineSentAt('offline:2026-11-06T22:15:03Z')).toBe(Date.UTC(2026, 10, 6, 22, 15, 3))
  })
  it('is null for live messages and junk', () => {
    expect(offlineSentAt(undefined)).toBeNull()
    expect(offlineSentAt('')).toBeNull()
    expect(offlineSentAt('delivered')).toBeNull()
    expect(offlineSentAt('offline:')).toBeNull()
    expect(offlineSentAt('offline:not a date')).toBeNull()
  })
})

describe('REPORT_REASONS', () => {
  it('ends with a catch-all and has unique ids', () => {
    const ids = REPORT_REASONS.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids[ids.length - 1]).toBe('other')
  })
})
