/** The reasons the server files a report under. Keep in step with
 * abuseReasons in nexus_server/main.go. */
export const REPORT_REASONS: { id: string; label: string }[] = [
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'spam', label: 'Spam or scams' },
  { id: 'impersonation', label: 'Pretending to be someone else' },
  { id: 'inappropriate', label: 'Inappropriate content' },
  { id: 'other', label: 'Something else' },
]

/**
 * Messages the server held while you were offline arrive with
 * status "offline:<created_at>", where created_at is SQLite's UTC
 * "YYYY-MM-DD HH:MM:SS". Returns that time in ms, or null for a live message.
 */
export function offlineSentAt(status: string | undefined): number | null {
  if (!status || !status.startsWith('offline:')) return null
  const raw = status.slice('offline:'.length).trim()
  if (!raw) return null
  // SQLite omits the T and the zone; it is always UTC.
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw) ? raw.replace(' ', 'T') + 'Z' : raw
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : null
}
