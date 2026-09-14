export type UserStatus = 'Online' | 'Away' | 'Do Not Disturb' | 'Invisible'

export const STATUSES: UserStatus[] = ['Online', 'Away', 'Do Not Disturb', 'Invisible']

export const IDLE_MS = 10 * 60 * 1000

// Idle only ever downgrades Online → Away. A status the user picked by
// hand (Away, DND, Invisible) sticks until they change it.
export function effectiveStatus(manual: UserStatus, idle: boolean): UserStatus {
  return manual === 'Online' && idle ? 'Away' : manual
}
