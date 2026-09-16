/** Theme registry for the Phaze web app.
 *
 * A theme id is just a token appended to the app root class ("app theme-<id>"),
 * so adding a new era = one CSS block in App.css matching `.app.theme-<id>`
 * plus one entry in the THEMES array below.
 */

export type ThemeId =
  | 'light'
  | 'dark'
  | 'skype3'
  | 'skype4'
  | 'skype5'
  | 'skype6'
  | 'skype7'
  | 'skype8'

export interface ThemeMeta {
  id: ThemeId
  label: string
  /** Short subtitle, usually the release year — shown next to the label in pickers. */
  hint?: string
  icon: string
  /** true when the theme aims to recreate a real Skype release. */
  era?: boolean
  /**
   * Kept working, but not offered to anyone.
   *
   * The two plain Phaze themes are shelved: the goal is a faithful
   * recreation of each Skype release, and an invented house theme sitting
   * in the same picker invites exactly the generalisation that makes the
   * eras blur into each other. They stay in the type and in the CSS so
   * nothing breaks and so they can come back once the six releases are
   * actually right — but nothing selects them.
   */
  hidden?: boolean
}

/** Display order — chronological, oldest first. */
export const THEMES: ThemeMeta[] = [
  { id: 'skype3', label: 'Skype 3',  hint: '2007 · XP Luna',       icon: '💠', era: true },
  { id: 'skype4', label: 'Skype 4',  hint: '2009 · Vista Aero',    icon: '🔷', era: true },
  { id: 'skype5', label: 'Skype 5',  hint: '2010',                 icon: '🔵', era: true },
  { id: 'skype6', label: 'Skype 6',  hint: '2012 · Metro',         icon: '⬛', era: true },
  { id: 'skype7', label: 'Skype 7',  hint: '2014 · Aero blue',     icon: '💙', era: true },
  { id: 'skype8', label: 'Skype 8+', hint: '2018 · Fluent',        icon: '🩶', era: true },
  { id: 'light',  label: 'Phaze Light',                              icon: '☀', hidden: true },
  { id: 'dark',   label: 'Phaze Dark',                               icon: '🌙', hidden: true },
]

/** The themes a person can actually pick. */
export const SELECTABLE_THEMES: ThemeMeta[] = THEMES.filter(t => !t.hidden)

/** What to fall back to — the release the app's layout was built around. */
export const DEFAULT_THEME: ThemeId = 'skype7'

const THEME_IDS = new Set<ThemeId>(THEMES.map(t => t.id))

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === 'string' && THEME_IDS.has(v as ThemeId)
}

export function themeMeta(id: ThemeId): ThemeMeta {
  // Fall back to the default rather than the last entry in the array —
  // the tail of THEMES is now a shelved theme, so "last" would hand back
  // something nothing is allowed to select.
  return THEMES.find(t => t.id === id)
    ?? THEMES.find(t => t.id === DEFAULT_THEME)!
}

export function themeIcon(id: ThemeId): string {
  return themeMeta(id).icon
}

export function themeLabel(id: ThemeId): string {
  return themeMeta(id).label
}

/** Cycle helper for the quick toggle button in the header.
 *  Walks the selectable themes only, so a shelved one can never be
 *  cycled into even if it's somehow the current theme. */
export function nextTheme(current: ThemeId): ThemeId {
  const idx = SELECTABLE_THEMES.findIndex(t => t.id === current)
  const next = SELECTABLE_THEMES[(idx + 1) % SELECTABLE_THEMES.length]
  return next.id
}

/** Resolve a stored or incoming theme id to one that's actually offered.
 *  Anyone whose browser still remembers a shelved theme lands on the
 *  default instead of being stuck on something with no way back. */
export function resolveTheme(v: unknown): ThemeId {
  if (!isThemeId(v)) return DEFAULT_THEME
  return themeMeta(v).hidden ? DEFAULT_THEME : v
}

/** True for any theme that recreates a real Skype release. The main app has
 *  a handful of layout branches gated to 'skype7'; use this if you want them
 *  to fire for every era-accurate theme instead. */
export function isSkypeEra(id: ThemeId): boolean {
  return themeMeta(id).era === true
}

/** True for the classic desktop releases, Skype 3 through 7.
 *
 *  These shared a house style that Skype 8 abandoned: a menu bar, a compact
 *  contact list, and a flat message log where every line carries its own
 *  "Name  timestamp" header instead of being wrapped in a chat bubble.
 *  Skype 8 is deliberately excluded — it's the release that moved to modern
 *  right-aligned bubbles. */
export function isClassicSkype(id: ThemeId): boolean {
  return id === 'skype3' || id === 'skype4' || id === 'skype5' ||
         id === 'skype6' || id === 'skype7'
}

/* =============================================================
   Per-era feature capabilities.

   Each era-accurate theme reveals only what that Skype version
   actually shipped. Modern additions (Spaces, Live, Reactions, etc.)
   stay hidden when a user picks Skype 3 so the app *feels* like that
   era, not modern-Phaze-in-2007-paint.

   The plain 'light' and 'dark' themes are treated as the full
   modern Phaze — everything is on.

   Dates and limits are sourced in docs/skype-era-research.md.
   Summary of what each release actually added:

     Skype 3 (2006-07) — text, voice, video (from 2.x), file transfer,
                         mood messages, emoticons, message EDITING.
                         Group text chat and conference calling ALREADY
                         EXISTED; Skypecasts carried up to 100 people.
     Skype 4 (2009)    — + screen sharing (4.1, paid/capped for years)
     Skype 5 (2010)    — + group VIDEO calling (beta, 5 people, later 10;
                         paid Premium feature Jan 2011 - Apr 2014)
     Skype 6 (2012)    — Microsoft account sign-in, Messenger merge.
                         No new conversation feature of its own.
     Skype 7 (2014-18) — + Mojis (Sept 2015), Skype Translator,
                         Highlights (a real Stories clone, Aug 2017,
                         walked back Sept 2018)
     Skype 8+ (2018)   — + @mentions, quoted messages, read receipts
                         (Sept 2018), call recording (Sept 2018), themes.
                         "Reactions" is kept here as the best guess, not
                         a sourced fact — see the correction below.

   Corrections made after checking the source-verified research in
   docs/skype-eras/ (see GATING-DIFF.md for the full evidence trail)
   rather than trusting the earlier table:

   * group_chat and group_call were gated at Skype 5. That was wrong —
     it conflated group *video* (which is the genuine 5.0 milestone)
     with group text chat and audio conferencing, both of which predate
     Skype 3 entirely. Skype was designing multi-person chat in 2004.
     Group video is now its own feature so the 5.0 boundary is kept
     without hiding 3.x and 4.x capabilities that really existed.

   * remote_control was gated at Skype 6 on an admitted guess. No
     consumer Skype release shipped remote desktop control; "give
     control" belongs to the Skype for Business lineage, same as the
     whiteboard. It is treated as a Phaze original now.

   * edit_message was gated to Skype 8 on the assumption that reactions,
     @mentions, edit and delete all launched together in July 2018.
     docs/skype-eras/skype3.md sources AfterDawn's own version-history
     page listing "Edit chat messages" as new in build 3.2.0.163 (2007)
     — eleven years earlier. Moved into SKYPE3_BASE.

   * delete_message was gated to Skype 8 on the same launch-bundle
     assumption. The evidence is weaker than edit_message's — an
     undated Wikipedia line in docs/skype-eras/skype7.md ("remove or
     edit individual messages during one hour after sending") that
     isn't pinned to a specific version — but it's still evidence of
     predating Skype 8, and none was found for an 8.0-launch date
     either. Moved into SKYPE7 as a floor, not a confirmed origin
     version; see GATING-DIFF.md correction #2.

   * reactions is left gated at Skype 8, but on weaker grounds than the
     old comment claimed. docs/skype-eras/skype8.md's own Differences
     section states plainly that this pass found no evidence
     message-level reactions shipped with 8.0, or at any specific
     later date — the only sourced "reactions" anywhere in the
     research are 2017-18 Highlights-post reactions, a different,
     removed surface. Skype 8 is kept as the best available guess
     (modern Skype almost certainly has some form of this by now) but
     the claim is no longer stated as settled fact; see GATING-DIFF.md
     correction #4.

   * stories was treated as a Phaze original with no real Skype
     equivalent. docs/skype-eras/skype8.md sources Skype's real
     "Highlights" feature — a Snapchat/Stories-style photo/video feed,
     reactions and all — which shipped under the Skype 7 version number
     in August 2017 and was removed again in September 2018, before
     Skype 8.0 had even been out two months. Moved to Skype 7. Phaze's
     Stories are a from-scratch feature, not a recreation of Highlights'
     actual UI (which nothing in the sourced research describes in
     enough detail to rebuild) — this only fixes *when* the capability
     existed, not what it looked like.

   Discord-style Spaces and public Livestreams have no real Skype
   equivalent found in the source-verified research — they're Phaze
   originals, so they only unlock on the modern era ('skype8') and the
   plain Phaze themes.
   ============================================================= */

export type Feature =
  | 'text_chat'
  | 'voice_call'
  | 'video_call'
  | 'screen_share'
  | 'file_transfer'
  | 'group_chat'
  | 'group_call'
  /** Group VIDEO calling — the actual Skype 5.0 milestone. */
  | 'group_video'
  | 'mood'
  | 'emoticons'
  | 'mojis'
  /** Gated at Skype 8 as a best guess, not a sourced fact — no evidence
   *  of message-level reactions was found at any date. See
   *  docs/skype-eras/skype8.md and GATING-DIFF.md correction #4. */
  | 'reactions'
  /** Skype 3.2 (build 3.2.0.163, 2007) — see docs/skype-eras/skype3.md. */
  | 'edit_message'
  /** Skype 7 as a floor, not a confirmed origin version — see
   *  docs/skype-eras/skype7.md and GATING-DIFF.md correction #2. */
  | 'delete_message'
  | 'mentions'
  /** Delivered/seen ticks. Skype 8, summer 2018. */
  | 'read_receipts'
  /** Pinning a message to the top of a conversation — a Phaze original. */
  | 'pinned_messages'
  | 'remote_control'
  /** Skype 7 (Highlights, Aug 2017 - Sept 2018) — see docs/skype-eras/skype8.md.
   *  Phaze's implementation is original work; only the era it unlocks at
   *  is a recreation of when the real capability existed. */
  | 'stories'
  | 'live_streams'
  | 'spaces'
  | 'dark_mode'

const MODERN_ALL: Feature[] = [
  'text_chat', 'voice_call', 'video_call', 'screen_share', 'file_transfer',
  'group_chat', 'group_call', 'group_video', 'mood', 'emoticons', 'mojis',
  'reactions', 'edit_message', 'delete_message', 'mentions', 'read_receipts',
  'pinned_messages', 'remote_control', 'stories', 'live_streams', 'spaces',
  'dark_mode',
]

/** Everything Skype could already do by the time of our earliest theme.
 *  Text, voice and file transfer are 1.x; video is 2.x; group text chat
 *  and conference calling predate 3.x as well. Mood messages are 3.0.
 *  Message editing is 3.2 (2007) — see docs/skype-eras/skype3.md. */
const SKYPE3_BASE: Feature[] = [
  'text_chat', 'voice_call', 'video_call', 'file_transfer',
  'group_chat', 'group_call', 'mood', 'emoticons', 'edit_message',
]

/* Each era is the one before it plus what that release actually added.
   Written cumulatively so a boundary can only be changed in one place,
   and so it's obvious at a glance which release introduced what. */
const SKYPE4 = [...SKYPE3_BASE, 'screen_share'] as Feature[]
const SKYPE5 = [...SKYPE4, 'group_video'] as Feature[]
/* Skype 6's headline changes were Microsoft account sign-in and the
   Messenger merge — account plumbing, not conversation features. It
   genuinely adds nothing to this table, which is a finding rather than
   an omission. */
const SKYPE6 = SKYPE5
/* Mojis (Sept 2015) and Highlights, Skype's real Stories clone, which
   shipped under the Skype 7 version number in August 2017 and was
   removed again in September 2018 — see docs/skype-eras/skype8.md.
   delete_message is added here as a floor, not a confirmed origin
   version — see the correction note above. */
const SKYPE7 = [...SKYPE6, 'mojis', 'stories', 'delete_message'] as Feature[]

const FEATURES_BY_ERA: Record<ThemeId, Feature[]> = {
  skype3: SKYPE3_BASE,
  skype4: SKYPE4,
  skype5: SKYPE5,
  skype6: SKYPE6,
  skype7: SKYPE7,
  skype8: MODERN_ALL,
  light:  MODERN_ALL,
  dark:   MODERN_ALL,
}

/** True when the given theme should expose the named feature. */
export function hasFeature(theme: ThemeId, feature: Feature): boolean {
  return FEATURES_BY_ERA[theme].includes(feature)
}

/** All features enabled for a theme, useful for building filtered UIs. */
export function featuresOf(theme: ThemeId): readonly Feature[] {
  return FEATURES_BY_ERA[theme]
}
