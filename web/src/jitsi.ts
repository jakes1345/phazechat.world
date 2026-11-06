import { hasFeature, type ThemeId } from './themes'

/** Calls run in a meet.jit.si room inside an iframe. Jitsi reads config
 *  overrides from the URL fragment (`#config.key=<json>`), which is how each
 *  era gets the call controls its release actually had:
 *
 *  - screen sharing only from the era that introduced it (Skype 4.1)
 *  - a camera button in group calls only from the group-video era (Skype 5)
 *  - audio calls start with the camera off, video calls with it on
 *
 *  The fragment never reaches Jitsi's servers as part of the request, and
 *  the room name stays the only identifier in the path. */

export type CallKind = 'audio' | 'video'

export type JitsiCallOptions = {
  theme: ThemeId
  kind: CallKind
  /** More than two people. Group video is its own era boundary. */
  group: boolean
}

/** The toolbar buttons an era's call window shows. */
export function toolbarFor({ theme, group }: JitsiCallOptions): string[] {
  const videoAllowed = group ? hasFeature(theme, 'group_video') : hasFeature(theme, 'video_call')
  const buttons = ['microphone']
  if (videoAllowed) buttons.push('camera')
  if (hasFeature(theme, 'screen_share')) buttons.push('desktop')
  if (group) buttons.push('participants-pane', 'tileview')
  buttons.push('settings', 'fullscreen', 'hangup')
  return buttons
}

function frag(key: string, value: unknown): string {
  return `config.${key}=${encodeURIComponent(JSON.stringify(value))}`
}

/** Room names reach Jitsi as a path segment; keep them to a safe charset. */
export function safeRoom(room: string): string {
  return room.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120)
}

export function jitsiCallUrl(room: string, opts: JitsiCallOptions): string {
  const videoAllowed = opts.group ? hasFeature(opts.theme, 'group_video') : hasFeature(opts.theme, 'video_call')
  const startMuted = opts.kind === 'audio' || !videoAllowed
  const parts = [
    frag('prejoinConfig.enabled', false),
    frag('startWithVideoMuted', startMuted),
    frag('startAudioOnly', !videoAllowed),
    frag('disableDeepLinking', true),
    frag('toolbarButtons', toolbarFor(opts)),
  ]
  return `https://meet.jit.si/${safeRoom(room)}#${parts.join('&')}`
}
