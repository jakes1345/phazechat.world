import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { GoogleButton, GoogleFollowUp } from './GoogleSignIn'

const noop = () => {}

describe('GoogleButton', () => {
  it('links to the server start, carrying the referral', () => {
    const html = renderToStaticMarkup(<GoogleButton refBy="friend1" label="Sign up with Google" />)
    expect(html).toContain('href="/api/v1/auth/google/start?ref=friend1"')
    expect(html).toContain('Sign up with Google')
  })
})

describe('GoogleFollowUp', () => {
  it('asks a new Google account for a username, prefilled with the suggestion', () => {
    const html = renderToStaticMarkup(
      <GoogleFollowUp flow={{ kind: 'username', ticket: 't', email: 'a@b.com', suggest: 'alex_b' }} onSignedIn={noop} onDone={noop} />,
    )
    expect(html).toContain('Choose your Phaze name')
    expect(html).toContain('a@b.com')
    expect(html).toContain('value="alex_b"')
  })

  it('asks for the existing account’s password to connect, with the username fixed', () => {
    const html = renderToStaticMarkup(
      <GoogleFollowUp flow={{ kind: 'link', ticket: 't', email: 'a@b.com', user: 'alex' }} onSignedIn={noop} onDone={noop} />,
    )
    expect(html).toContain('Connect your Phaze account')
    expect(html).toMatch(/value="alex"[^>]*readOnly|readOnly[^>]*value="alex"/i)
    expect(html).toContain('type="password"')
  })

  it('asks for the 2FA code', () => {
    const html = renderToStaticMarkup(<GoogleFollowUp flow={{ kind: 'totp', ticket: 't' }} onSignedIn={noop} onDone={noop} />)
    expect(html).toContain('Two-step verification')
  })

  it('shows the server’s error', () => {
    const html = renderToStaticMarkup(<GoogleFollowUp flow={{ kind: 'error', msg: 'That Google account is banned.' }} onSignedIn={noop} onDone={noop} />)
    expect(html).toContain('That Google account is banned.')
  })
})
