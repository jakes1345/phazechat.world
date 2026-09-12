import { useEffect, useState } from 'react'
import { getAvatarVersion, subscribeAvatarVersion } from './avatarVersions'

/**
 * Profile-picture layer for the letter-circle avatars. Drop inside any
 * `.avatar` span: paints over the letter when the user has a picture,
 * disappears (404) when they don't.
 *
 * The version registry lives in ./avatarVersions so this module exports only
 * a component — mixing component and non-component exports breaks Fast
 * Refresh, which is what the react-refresh lint rule was flagging.
 */
export function AvatarImg({ user }: { user: string }) {
  const [v, setV] = useState(() => getAvatarVersion(user))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // Re-read on subscribe as well as on bump: the user prop can change after
    // mount, and the initial useState value is only computed once.
    setFailed(false)
    setV(getAvatarVersion(user))
    return subscribeAvatarVersion(user, () => {
      setFailed(false)
      setV(getAvatarVersion(user))
    })
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
