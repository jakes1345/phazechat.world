/** Message bookmarks, synced through the per-user settings store so they
 *  follow the account to every device.
 *
 *  Only the conversation and message id are stored, never the message
 *  text: DMs are end-to-end encrypted, and a bookmark list on the server
 *  must not become a plaintext copy of the messages it points at. */

export type Bookmark = {
  /** Conversation key: a username for DMs, `g:<id>` for group chats. */
  c: string
  id: string
  /** When it was bookmarked. */
  at: number
}

export const BOOKMARKS_SETTING = 'bookmarks'
/** The settings store caps a value at 64 KB; this keeps well under it. */
export const BOOKMARKS_MAX = 500

export function parseBookmarks(raw: string | undefined | null): Bookmark[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) return []
    return v.filter((b): b is Bookmark =>
      !!b && typeof b === 'object'
      && typeof (b as Bookmark).c === 'string'
      && typeof (b as Bookmark).id === 'string'
      && typeof (b as Bookmark).at === 'number',
    ).slice(-BOOKMARKS_MAX)
  } catch {
    return []
  }
}

export function serializeBookmarks(list: Bookmark[]): string {
  return JSON.stringify(list.slice(-BOOKMARKS_MAX))
}

/** Add the bookmark if it's missing, remove it if it's there. Oldest are
 *  dropped first once the cap is reached. */
export function toggleBookmark(list: Bookmark[], c: string, id: string, now = Date.now()): Bookmark[] {
  const has = list.some((b) => b.c === c && b.id === id)
  if (has) return list.filter((b) => !(b.c === c && b.id === id))
  return [...list, { c, id, at: now }].slice(-BOOKMARKS_MAX)
}

export function bookmarkIdsFor(list: Bookmark[], c: string): Set<string> {
  return new Set(list.filter((b) => b.c === c).map((b) => b.id))
}
