/** Structured message bodies beyond plain text and file attachments.
 *
 *  Every kind is a prefix plus JSON inside the ordinary message body, the
 *  same pattern as `phaze-file{...}` attachments. That keeps them inside the
 *  existing end-to-end encryption for DMs: the server stores and relays one
 *  opaque string and never learns that a message is a contact card or a
 *  quote.
 *
 *  Pure: no React, no I/O. */

export const CONTACT_PREFIX = 'phaze-contact'
export const QUOTE_PREFIX = 'phaze-quote'

/** Someone's contact details shared into a chat ("Send Contacts"). */
export type ContactCard = {
  username: string
  /** Display name at the time it was shared, if the sender knew one. */
  display?: string
  /** Their mood message at the time it was shared. */
  mood?: string
}

const USERNAME_RE = /^[A-Za-z0-9_.-]{1,64}$/

export function encodeContactCard(card: ContactCard): string {
  const out: ContactCard = { username: card.username }
  if (card.display) out.display = card.display.slice(0, 64)
  if (card.mood) out.mood = card.mood.slice(0, 140)
  return CONTACT_PREFIX + JSON.stringify(out)
}

export function decodeContactCard(text: string): ContactCard | null {
  if (!text.startsWith(CONTACT_PREFIX + '{')) return null
  try {
    const raw = JSON.parse(text.slice(CONTACT_PREFIX.length)) as Record<string, unknown>
    if (typeof raw.username !== 'string' || !USERNAME_RE.test(raw.username)) return null
    const card: ContactCard = { username: raw.username }
    if (typeof raw.display === 'string' && raw.display) card.display = raw.display.slice(0, 64)
    if (typeof raw.mood === 'string' && raw.mood) card.mood = raw.mood.slice(0, 140)
    return card
  } catch {
    return null
  }
}

/** The quoted part of a quote reply. */
export type QuoteRef = {
  /** Message id of the quoted message, so the quote can jump to it. */
  id: string
  from: string
  /** The quoted text, trimmed to keep bodies small. */
  text: string
  ts: number
}

export const QUOTE_TEXT_MAX = 280

/** Body layout: `phaze-quote{json}\n<reply text>`. The JSON never contains a
 *  raw newline (JSON.stringify escapes them), so the first newline always
 *  ends it. */
export function encodeQuote(quote: QuoteRef, reply: string): string {
  const q: QuoteRef = {
    id: quote.id,
    from: quote.from,
    text: quote.text.slice(0, QUOTE_TEXT_MAX),
    ts: quote.ts,
  }
  return `${QUOTE_PREFIX}${JSON.stringify(q)}\n${reply}`
}

export function decodeQuote(text: string): { quote: QuoteRef; reply: string } | null {
  if (!text.startsWith(QUOTE_PREFIX + '{')) return null
  const nl = text.indexOf('\n')
  if (nl === -1) return null
  try {
    const raw = JSON.parse(text.slice(QUOTE_PREFIX.length, nl)) as Record<string, unknown>
    if (typeof raw.id !== 'string' || typeof raw.from !== 'string' || typeof raw.text !== 'string') return null
    const ts = typeof raw.ts === 'number' && Number.isFinite(raw.ts) ? raw.ts : 0
    return {
      quote: { id: raw.id, from: raw.from, text: raw.text.slice(0, QUOTE_TEXT_MAX), ts },
      reply: text.slice(nl + 1),
    }
  } catch {
    return null
  }
}

/** What the quoted text should say about a message that is itself
 *  structured — quoting a contact card or a quote reply should show what a
 *  person sees, not the encoded body. */
export function quotableText(text: string): string {
  const card = decodeContactCard(text)
  if (card) return `Contact: ${card.display || card.username}`
  const q = decodeQuote(text)
  if (q) return q.reply
  return text
}

/** One-line description of a body, for conversation previews and search. */
export function previewText(text: string): string {
  const card = decodeContactCard(text)
  if (card) return `👤 ${card.display || card.username}`
  const q = decodeQuote(text)
  if (q) return q.reply
  return text
}
