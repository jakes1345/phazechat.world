import { describe, expect, it } from 'vitest'
import { googleStartUrl, parseGoogleReturn } from './googleAuth'

describe('parseGoogleReturn', () => {
  it('ignores fragments that are not from Google sign-in', () => {
    expect(parseGoogleReturn('')).toBeNull()
    expect(parseGoogleReturn('#chat=abc')).toBeNull()
    expect(parseGoogleReturn('#google=nonsense&ticket=x')).toBeNull()
  })

  it('reads the username step with its suggestion', () => {
    expect(parseGoogleReturn('#google=username&ticket=t1&email=a%40b.com&suggest=alex_b')).toEqual({
      kind: 'username', ticket: 't1', email: 'a@b.com', suggest: 'alex_b',
    })
  })

  it('reads the link step with the account hint', () => {
    expect(parseGoogleReturn('#google=link&ticket=t2&email=a%40b.com&user=alex')).toEqual({
      kind: 'link', ticket: 't2', email: 'a@b.com', user: 'alex',
    })
  })

  it('needs a ticket for every step that posts back', () => {
    expect(parseGoogleReturn('#google=username')).toBeNull()
    expect(parseGoogleReturn('#google=link&email=a%40b.com')).toBeNull()
    expect(parseGoogleReturn('#google=totp')).toBeNull()
    expect(parseGoogleReturn('#google=totp&ticket=t3')).toEqual({ kind: 'totp', ticket: 't3' })
  })

  it('reads linked and error results', () => {
    expect(parseGoogleReturn('#google=linked&email=a%40b.com')).toEqual({ kind: 'linked', email: 'a@b.com' })
    expect(parseGoogleReturn('#google=error&msg=That%20Google%20account%20is%20taken')).toEqual({
      kind: 'error', msg: 'That Google account is taken',
    })
    expect(parseGoogleReturn('#google=error')).toMatchObject({ kind: 'error' })
  })
})

describe('googleStartUrl', () => {
  it('builds the start link', () => {
    expect(googleStartUrl()).toBe('/api/v1/auth/google/start')
    expect(googleStartUrl({ ref: 'friend1' })).toBe('/api/v1/auth/google/start?ref=friend1')
    expect(googleStartUrl({ link: true })).toBe('/api/v1/auth/google/start?intent=link')
  })
})
