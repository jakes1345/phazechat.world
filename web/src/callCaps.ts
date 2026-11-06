import { hasFeature, type ThemeId } from './themes'

/** What an era's group call window offers. Group voice calls go back to the
 *  first era; group video and screen sharing each arrived later, so earlier
 *  eras get a voice-only call with no share button. */
export type GroupCallCaps = {
  allowVideo: boolean
  allowScreenShare: boolean
  startWithCamera: boolean
}

export function groupCallCaps(theme: ThemeId, kind: 'audio' | 'video'): GroupCallCaps {
  const allowVideo = hasFeature(theme, 'group_video')
  return {
    allowVideo,
    allowScreenShare: hasFeature(theme, 'screen_share'),
    startWithCamera: kind === 'video' && allowVideo,
  }
}
