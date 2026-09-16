import { describe, expect, it } from 'vitest'
import { effectiveStatus, statusesForEra } from './presence'

describe('statusesForEra', () => {
  it('offers Skype Me only at Skype 3', () => {
    // "I'll take calls from strangers" — present since Skype's early days,
    // hidden from the picker starting Skype 4, removed completely by
    // Skype 5. See docs/skype-eras/skype3.md.
    expect(statusesForEra('skype3')).toContain('Skype Me')
    for (const era of ['skype4', 'skype5', 'skype6', 'skype7', 'skype8'] as const) {
      expect(statusesForEra(era), `${era} must not offer Skype Me`).not.toContain('Skype Me')
    }
  })

  it('offers Not Available only at Skype 4', () => {
    // Arrived in Skype 4, gone again by Skype 5. See
    // docs/skype-eras/skype4.md.
    expect(statusesForEra('skype4')).toContain('Not Available')
    for (const era of ['skype3', 'skype5', 'skype6', 'skype7', 'skype8'] as const) {
      expect(statusesForEra(era), `${era} must not offer Not Available`).not.toContain('Not Available')
    }
  })

  it('keeps the baseline four in every era', () => {
    const baseline = ['Online', 'Away', 'Do Not Disturb', 'Invisible']
    for (const era of ['skype3', 'skype4', 'skype5', 'skype6', 'skype7', 'skype8'] as const) {
      for (const s of baseline) expect(statusesForEra(era)).toContain(s)
    }
  })
})

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
