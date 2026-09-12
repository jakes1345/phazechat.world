/**
 * Avatar cache-busting registry.
 *
 * Lives apart from the <AvatarImg> component on purpose: a module that exports
 * both a component and plain helpers breaks React Fast Refresh, which can only
 * hot-swap files whose exports are all components. Keeping the registry here
 * lets AvatarImg.tsx stay component-only.
 */

const versions = new Map<string, number>()
const listeners = new Map<string, Set<() => void>>()

/** Bump a user's version so every mounted avatar for them refetches at once. */
export function bumpAvatarVersion(user: string) {
  versions.set(user, (versions.get(user) ?? 0) + 1)
  listeners.get(user)?.forEach((fn) => fn())
}

export function getAvatarVersion(user: string): number {
  return versions.get(user) ?? 0
}

/** Subscribe to bumps for one user. Returns an unsubscribe function. */
export function subscribeAvatarVersion(user: string, fn: () => void): () => void {
  let set = listeners.get(user)
  if (!set) {
    set = new Set()
    listeners.set(user, set)
  }
  set.add(fn)
  return () => {
    set.delete(fn)
    if (set.size === 0) listeners.delete(user)
  }
}
