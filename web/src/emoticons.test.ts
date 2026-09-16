import { describe, expect, it } from 'vitest'
import { tokenize, EMOTICONS, EXPRESSIVE_EMOTICONS, FLAG_EMOTICONS } from './emoticons'

const flat = (s: string) => tokenize(s).map((t) => (t.kind === 'text' ? t.value : `[${t.id}]`)).join('')

describe('emoticon data', () => {
  it('never lets two entries claim the same shortcut', () => {
    // A silent collision doesn't error — it just makes whichever entry
    // comes first in the array permanently unreachable, so this has to be
    // an explicit check rather than something a broken tokenize() test
    // would happen to catch.
    const owner = new Map<string, string>()
    for (const e of EMOTICONS) {
      for (const s of e.shortcuts) {
        expect(owner.has(s), `"${s}" is claimed by both ${owner.get(s)} and ${e.id}`).toBe(false)
        owner.set(s, e.id)
      }
    }
  })

  it('splits expressive emoticons from flags with no overlap', () => {
    expect(EXPRESSIVE_EMOTICONS.length + FLAG_EMOTICONS.length).toBe(EMOTICONS.length)
    const flagIds = new Set(FLAG_EMOTICONS.map((e) => e.id))
    for (const e of EXPRESSIVE_EMOTICONS) expect(flagIds.has(e.id)).toBe(false)
  })

  it('gives every entry at least one shortcut, an emoji, and a label', () => {
    for (const e of EMOTICONS) {
      expect(e.shortcuts.length, `${e.id} has no shortcuts`).toBeGreaterThan(0)
      expect(e.emoji, `${e.id} has no emoji`).toBeTruthy()
      expect(e.label, `${e.id} has no label`).toBeTruthy()
    }
  })
})

describe('tokenize', () => {
  it('converts word shortcuts', () => {
    expect(flat('hi (wave) there')).toBe('hi [wave] there')
  })
  it('converts symbol shortcuts', () => {
    expect(flat('ok :) bye :-(')).toBe('ok [smile] bye [sad]')
  })
  it('leaves unknown parens alone', () => {
    expect(flat('call me (maybe)')).toBe('call me (maybe)')
  })
  it('never touches URLs', () => {
    expect(flat('see https://a.io/x:(y) ok')).toBe('see https://a.io/x:(y) ok')
  })
  it('handles emoticon-only messages', () => {
    expect(tokenize('(heart)')).toEqual([{ kind: 'emoticon', id: 'heart', shortcut: '(heart)' }])
  })
  it('prefers the longest match', () => {
    expect(flat(':-)')).toBe('[smile]') // not ":-" + ")"
  })
})
