import { describe, expect, it } from 'vitest'
import { effectiveStatus } from './presence'

describe('effectiveStatus', () => {
  it('idles Online down to Away', () => {
    expect(effectiveStatus('Online', true)).toBe('Away')
  })
  it('never overrides a manual choice', () => {
    expect(effectiveStatus('Do Not Disturb', true)).toBe('Do Not Disturb')
    expect(effectiveStatus('Invisible', true)).toBe('Invisible')
    expect(effectiveStatus('Away', true)).toBe('Away')
  })
  it('reverts on activity', () => {
    expect(effectiveStatus('Online', false)).toBe('Online')
  })
})
