// Skype-7-style presence badges, drawn by hand so we ship zero third-party art.
export function PresenceIcon({ status, size = 12 }: { status: string; size?: number }) {
  const s = { width: size, height: size, display: 'inline-block', verticalAlign: 'middle' } as const
  if (status === 'Online')
    return (
      <svg viewBox="0 0 12 12" style={s}><circle cx="6" cy="6" r="6" fill="#7BA700" />
        <path d="M3.2 6.2l2 2 3.6-4" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" /></svg>
    )
  if (status === 'Away')
    return (
      <svg viewBox="0 0 12 12" style={s}><circle cx="6" cy="6" r="6" fill="#FCAF17" />
        <path d="M6 3v3.2l2.2 1.4" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
    )
  if (status === 'Do Not Disturb')
    return (
      <svg viewBox="0 0 12 12" style={s}><circle cx="6" cy="6" r="6" fill="#E4141B" />
        <rect x="3" y="5.1" width="6" height="1.8" rx="0.9" fill="#fff" /></svg>
    )
  // "Not Available" — Skype 4-only. A hollow ring around a solid dot: online
  // enough to appear, but not fully reachable — distinct from Away's clock
  // hand and DND's flat bar.
  if (status === 'Not Available')
    return (
      <svg viewBox="0 0 12 12" style={s}><circle cx="6" cy="6" r="6" fill="#FCAF17" />
        <circle cx="6" cy="6" r="2.2" fill="none" stroke="#fff" strokeWidth="1.4" /></svg>
    )
  // "Skype Me" — Skype 3-only, "I'll take calls from strangers." A green
  // ring left open at the top, echoing an old-fashioned ringing-phone
  // motion line rather than a solid dot, to read as "extra open" next to
  // plain Online.
  if (status === 'Skype Me')
    return (
      <svg viewBox="0 0 12 12" style={s}><circle cx="6" cy="6" r="6" fill="#7BA700" />
        <path d="M6 2.4a3.6 3.6 0 1 1 -3.2 1.9" stroke="#fff" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        <circle cx="6" cy="6" r="1.3" fill="#fff" /></svg>
    )
  return (
    <svg viewBox="0 0 12 12" style={s}><circle cx="6" cy="6" r="5.2" fill="none" stroke="#A9A9A9" strokeWidth="1.6" />
      <path d="M4.2 4.2l3.6 3.6M7.8 4.2l-3.6 3.6" stroke="#A9A9A9" strokeWidth="1.4" strokeLinecap="round" /></svg>
  )
}
