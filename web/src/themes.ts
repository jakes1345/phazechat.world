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
   actually shipped. Modern additions (Spaces, Stories, Live,
   Reactions, etc.) stay hidden when a user picks Skype 3 so the
   app *feels* like that era, not modern-Phaze-in-2007-paint.

   The plain 'light' and 'dark' themes are treated as the full
   modern Phaze — everything is on.

   Reference dates from real Skype releases:
     Skype 3 (2007) — 1:1 text/voice/video/file transfer, mood, emoticons
     Skype 4 (2009) — + screen share
     Skype 5 (2010) — + group chat, group video (paid then, always-on now)
     Skype 6 (2012) — + remote assist
     Skype 7 (2014) — + Mojis / rich emoticon experience
     Skype 8+(2018) — + reactions, edit, delete, @mentions, dark mode

   Discord-style Spaces, ephemeral Stories, and public Livestreams
   never existed in real Skype — they're Phaze originals, so they
   only unlock on the modern era ('skype8') and the plain Phaze
   themes.
   ============================================================= */

export type Feature =
  | 'text_chat'
  | 'voice_call'
  | 'video_call'
  | 'screen_share'
  | 'file_transfer'
  | 'group_chat'
  | 'group_call'
  | 'mood'
  | 'emoticons'
  | 'mojis'
  | 'reactions'
  | 'edit_message'
  | 'delete_message'
  | 'mentions'
  | 'remote_control'
  | 'stories'
  | 'live_streams'
  | 'spaces'
  | 'dark_mode'

const MODERN_ALL: Feature[] = [
  'text_chat', 'voice_call', 'video_call', 'screen_share', 'file_transfer',
  'group_chat', 'group_call', 'mood', 'emoticons', 'mojis', 'reactions',
  'edit_message', 'delete_message', 'mentions', 'remote_control',
  'stories', 'live_streams', 'spaces', 'dark_mode',
]

const FEATURES_BY_ERA: Record<ThemeId, Feature[]> = {
  skype3: [
    'text_chat', 'voice_call', 'video_call', 'file_transfer', 'mood', 'emoticons',
  ],
  skype4: [
    'text_chat', 'voice_call', 'video_call', 'file_transfer', 'mood', 'emoticons',
    'screen_share',
  ],
  skype5: [
    'text_chat', 'voice_call', 'video_call', 'file_transfer', 'mood', 'emoticons',
    'screen_share', 'group_chat', 'group_call',
  ],
  skype6: [
    'text_chat', 'voice_call', 'video_call', 'file_transfer', 'mood', 'emoticons',
    'screen_share', 'group_chat', 'group_call', 'remote_control',
  ],
  skype7: [
    'text_chat', 'voice_call', 'video_call', 'file_transfer', 'mood', 'emoticons',
    'screen_share', 'group_chat', 'group_call', 'remote_control', 'mojis',
  ],
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
