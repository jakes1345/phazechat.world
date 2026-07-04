import { useEffect, useState } from 'react'

// Version counter per user so a fresh upload busts the browser cache on
// every mounted avatar at once.
const versions = new Map<string, number>()
const listeners = new Map<string, Set<() => void>>()

export function bumpAvatarVersion(user: string) {
  versions.set(user, (versions.get(user) ?? 0) + 1)
  listeners.get(user)?.forEach((fn) => fn())
}

/**
 * Profile-picture layer for the letter-circle avatars. Drop inside any
 * `.avatar` span: paints over the letter when the user has a picture,
 * disappears (404) when they don't.
 */
export function AvatarImg({ user }: { user: string }) {
  const [v, setV] = useState(() => versions.get(user) ?? 0)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const fn = () => { setFailed(false); setV(versions.get(user) ?? 0) }
    if (!listeners.has(user)) listeners.set(user, new Set())
    listeners.get(user)!.add(fn)
    return () => { listeners.get(user)?.delete(fn) }
  }, [user])
  if (failed) return null
  return (
    <img
      className="avatar-img"
      src={`/api/v1/avatars/${user}?v=${v}`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
