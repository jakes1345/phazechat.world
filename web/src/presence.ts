import type { ThemeId } from './themes'

export type UserStatus =
  | 'Online' | 'Away' | 'Do Not Disturb' | 'Invisible'
  /** Skype 3-only in the picker — "I'll take calls from strangers." Hidden
   *  from selection starting Skype 4, removed completely by Skype 5. See
   *  docs/skype-eras/skype3.md. */
  | 'Skype Me'
  /** Skype 4-only in the picker — arrived in 4.x, gone again by Skype 5.
   *  See docs/skype-eras/skype4.md. */
  | 'Not Available'

/** The baseline four, present in every era — used as a fallback and by
 *  callers that don't have a theme in scope. */
export const STATUSES: UserStatus[] = ['Online', 'Away', 'Do Not Disturb', 'Invisible']

/** Which self-selectable statuses a given era's status picker should
 *  offer. Both era-specific statuses are added onto, never replacing,
 *  the baseline four — Skype only ever accumulated within any one
 *  release's lifetime; these two are unusual in being removed later, but
 *  neither removal happened within the span of a single theme. */
export function statusesForEra(theme: ThemeId): UserStatus[] {
  if (theme === 'skype3') return [...STATUSES, 'Skype Me']
  if (theme === 'skype4') return [...STATUSES, 'Not Available']
  return STATUSES
}

export const IDLE_MS = 10 * 60 * 1000

// Idle only ever downgrades Online → Away. A status the user picked by
// hand (Away, DND, Invisible, Skype Me, Not Available) sticks until they
// change it.
export function effectiveStatus(manual: UserStatus, idle: boolean): UserStatus {
  return manual === 'Online' && idle ? 'Away' : manual
}
