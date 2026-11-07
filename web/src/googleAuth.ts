// Sign in with Google, the parts that aren't components: reading where the
// server's OAuth flow left off, whether it's switched on, and the start link.
// The components are in GoogleSignIn.tsx.

import { useEffect, useState } from 'react'

export type GoogleReturn =
  | { kind: 'username'; ticket: string; email: string; suggest: string }
  | { kind: 'link'; ticket: string; email: string; user: string }
  | { kind: 'totp'; ticket: string }
  | { kind: 'linked'; email: string }
  | { kind: 'error'; msg: string }

/** Reads what the server sent back in the URL fragment, if anything. */
export function parseGoogleReturn(hash: string): GoogleReturn | null {
  const p = new URLSearchParams(hash.replace(/^#/, ''))
  const kind = p.get('google')
  const ticket = p.get('ticket') ?? ''
  const email = p.get('email') ?? ''
  switch (kind) {
    case 'username':
      return ticket ? { kind, ticket, email, suggest: p.get('suggest') ?? '' } : null
    case 'link':
      return ticket ? { kind, ticket, email, user: p.get('user') ?? '' } : null
    case 'totp':
      return ticket ? { kind, ticket } : null
    case 'linked':
      return { kind, email }
    case 'error':
      return { kind, msg: p.get('msg') || 'Sign in with Google didn’t finish. Try again.' }
    default:
      return null
  }
}

/** Takes the Google step out of the address bar so a reload or a shared
 *  link doesn't carry the one-time ticket along. */
export function takeGoogleReturn(): GoogleReturn | null {
  if (typeof window === 'undefined') return null
  const r = parseGoogleReturn(window.location.hash)
  if (r) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }
  return r
}

export interface GoogleConfig { web: boolean; app: boolean }

/** Whether the server has Google sign-in switched on. */
export function useGoogleConfig(): GoogleConfig | null {
  const [cfg, setCfg] = useState<GoogleConfig | null>(null)
  useEffect(() => {
    let live = true
    fetch('/api/v1/auth/google/config', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => { if (live && c) setCfg({ web: !!c.web, app: !!c.app }) })
      .catch(() => {})
    return () => { live = false }
  }, [])
  return cfg
}

export function googleStartUrl(opts: { ref?: string | null; link?: boolean } = {}): string {
  const q = new URLSearchParams()
  if (opts.link) q.set('intent', 'link')
  if (opts.ref) q.set('ref', opts.ref)
  const s = q.toString()
  return '/api/v1/auth/google/start' + (s ? '?' + s : '')
}
