// Sign in with Google: the button, the steps that can follow it, and the
// Settings row for connecting or disconnecting a Google account.
//
// The server runs the whole OAuth exchange (nexus_server/google_auth.go). The
// browser just goes to /api/v1/auth/google/start and comes back to /web/
// either signed in already (session cookie set) or with a fragment such as
// #google=username&ticket=… naming the one step still needed.

import { useEffect, useState } from 'react'
import { googleStartUrl, type GoogleReturn } from './googleAuth'
import './google.css'

function GoogleMark() {
  // Google's "G" mark, as its sign-in branding guidelines specify.
  return (
    <svg className="google-mark" viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

/** The "Sign in with Google" button. A plain link: the server does the rest. */
export function GoogleButton({ refBy, label = 'Sign in with Google' }: { refBy?: string | null; label?: string }) {
  return (
    <a className="google-btn" href={googleStartUrl({ ref: refBy })}>
      <GoogleMark />
      <span>{label}</span>
    </a>
  )
}

async function postStep(path: string, body: Record<string, string>): Promise<{ ok: boolean; status?: string; error?: string }> {
  try {
    const res = await fetch(`/api/v1/auth/google/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ...body, device_info: `web/${window.location.hostname}` }),
    })
    const data = await res.json().catch(() => ({})) as { status?: string; error?: string }
    return { ok: res.ok && data.status === 'ok', status: data.status, error: data.error }
  } catch {
    return { ok: false, error: 'Network error. Try again.' }
  }
}

/**
 * The step after Google, when there is one: pick a username for a new
 * account, confirm an existing account's password to connect it, or enter a
 * 2FA code. onSignedIn runs once the session cookie is set.
 */
export function GoogleFollowUp({ flow, onSignedIn, onDone }: {
  flow: GoogleReturn
  onSignedIn: () => void
  onDone: () => void
}) {
  const step = flow
  const [username, setUsername] = useState(() =>
    flow.kind === 'username' ? flow.suggest : flow.kind === 'link' ? flow.user : '')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [needsTotp, setNeedsTotp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const run = async (path: string, body: Record<string, string>) => {
    setBusy(true)
    setErr('')
    const r = await postStep(path, body)
    setBusy(false)
    if (r.ok) { onSignedIn(); return }
    if (r.status === 'totp_required') {
      setNeedsTotp(true)
      setErr(r.error && path === 'link' && !code ? 'Enter your 2FA code or a backup code.' : (r.error ?? ''))
      return
    }
    setErr(r.error || 'That didn’t work. Try again.')
  }

  if (step.kind === 'error') {
    return (
      <div className="form google-step">
        <h2>Sign in with Google</h2>
        <p className="google-step-msg err">{step.msg}</p>
        <button type="button" onClick={onDone}>Back to sign in</button>
      </div>
    )
  }

  if (step.kind === 'linked') {
    return null // shown as a banner by the signed-in app
  }

  if (step.kind === 'totp') {
    return (
      <form className="form google-step" onSubmit={(e) => { e.preventDefault(); run('totp', { ticket: step.ticket, totp_code: code.trim() }) }}>
        <h2>Two-step verification</h2>
        <p className="muted small">Your account has 2FA on. Enter the code from your authenticator app, or a backup code.</p>
        <input placeholder="6-digit code or backup code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" autoFocus maxLength={11} />
        {err && <p className="google-step-msg err">{err}</p>}
        <button type="submit" disabled={busy || code.trim().length < 6}>{busy ? 'Checking…' : 'Verify'}</button>
        <button type="button" className="link-btn" onClick={onDone}>Cancel</button>
      </form>
    )
  }

  if (step.kind === 'link') {
    return (
      <form className="form google-step" onSubmit={(e) => {
        e.preventDefault()
        run('link', { ticket: step.ticket, username: username.trim(), password, totp_code: code.trim() })
      }}>
        <h2>Connect your Phaze account</h2>
        <p className="muted small">
          There's already a Phaze account for <strong>{step.email}</strong>. Enter its password once to
          connect Google to it. After that, Google signs you straight in.
        </p>
        <p className="muted small">Forgot it? Use “Forgot password?” on the sign-in screen, then come back.</p>
        <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" readOnly={!!step.user} />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus />
        {needsTotp && <input placeholder="2FA code or backup code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" maxLength={11} />}
        {err && <p className="google-step-msg err">{err}</p>}
        <button type="submit" disabled={busy || !username.trim() || !password}>{busy ? 'Connecting…' : 'Connect and sign in'}</button>
        <button type="button" className="link-btn" onClick={onDone}>Cancel</button>
      </form>
    )
  }

  // step.kind === 'username'
  return (
    <form className="form google-step" onSubmit={(e) => { e.preventDefault(); run('register', { ticket: step.ticket, username: username.trim() }) }}>
      <h2>Choose your Phaze name</h2>
      <p className="muted small">
        Signing up as <strong>{step.email}</strong>. Pick the username your contacts will find you by
        (3 to 32 letters, numbers, dots, dashes or underscores).
      </p>
      <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus maxLength={32} />
      {err && <p className="google-step-msg err">{err}</p>}
      <button type="submit" disabled={busy || username.trim().length < 3}>{busy ? 'Creating\u2026' : 'Create account'}</button>
      <button type="button" className="link-btn" onClick={onDone}>Cancel</button>
    </form>
  )
}

interface GoogleStatus { enabled: boolean; linked: boolean; email: string; password_set: boolean }

/** Settings > Security: connect or disconnect Google. */
export function GoogleAccountSettings() {
  const [st, setSt] = useState<GoogleStatus | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    fetch('/api/v1/auth/google/status', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (s) setSt(s as GoogleStatus) })
      .catch(() => {})
  }
  useEffect(load, [])

  if (!st || (!st.enabled && !st.linked)) return null

  const unlink = async () => {
    setBusy(true)
    setMsg('')
    try {
      const res = await fetch('/api/v1/auth/google/unlink', { method: 'POST', credentials: 'include' })
      const data = await res.json().catch(() => ({})) as { error?: string }
      if (res.ok) { setMsg('Google disconnected.'); load() } else setMsg(data.error || 'Couldn’t disconnect Google.')
    } catch {
      setMsg('Network error. Try again.')
    }
    setBusy(false)
  }

  return (
    <>
      <h3 className="settings-section-title">Google account</h3>
      {st.linked ? (
        <>
          <p className="settings-empty">
            Connected to <strong>{st.email || 'a Google account'}</strong>. You can sign in with Google or with your password.
          </p>
          {!st.password_set && (
            <p className="settings-empty">
              This account was made with Google and has no password yet. To add one, sign out and use “Forgot password?”.
            </p>
          )}
          <button className="settings-btn-secondary" onClick={unlink} disabled={busy || !st.password_set}>Disconnect Google</button>
        </>
      ) : (
        <>
          <p className="settings-empty">Connect Google to sign in with one tap, alongside your password.</p>
          <a className="google-btn google-btn-inline" href={googleStartUrl({ link: true })}>
            <GoogleMark />
            <span>Connect Google</span>
          </a>
        </>
      )}
      {msg && <p className={`settings-msg ${msg === 'Google disconnected.' ? 'ok' : 'err'}`}>{msg}</p>}
      <hr className="settings-divider" />
    </>
  )
}
