import { describe, expect, it } from 'vitest'
import { tokenize } from './emoticons'

const flat = (s: string) => tokenize(s).map((t) => (t.kind === 'text' ? t.value : `[${t.id}]`)).join('')

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
