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
  return (
    <svg viewBox="0 0 12 12" style={s}><circle cx="6" cy="6" r="5.2" fill="none" stroke="#A9A9A9" strokeWidth="1.6" />
      <path d="M4.2 4.2l3.6 3.6M7.8 4.2l-3.6 3.6" stroke="#A9A9A9" strokeWidth="1.4" strokeLinecap="round" /></svg>
  )
}
