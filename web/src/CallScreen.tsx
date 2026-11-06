import { useEffect, useRef } from 'react'
import { callPhaseText, type PeerCallPhase } from './peerCall'
import './call.css'

type CallState = {
  peer: string
  type: 'audio' | 'video'
  status: 'ringing' | 'active'
  direction: 'outgoing' | 'incoming'
}

export type CallMediaState = {
  local: MediaStream | null
  remote: MediaStream | null
  phase: PeerCallPhase
  muted: boolean
  cameraOff: boolean
}

function useSrcObject<T extends HTMLMediaElement>(stream: MediaStream | null) {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (el.srcObject !== stream) el.srcObject = stream
    if (stream) void el.play().catch(() => {})
  }, [stream])
  return ref
}

/**
 * The live part of a call: the other person's video (or just their voice)
 * and a small preview of your own camera. Used by every era's call screen.
 */
export function CallMedia({ kind, media, className }: {
  kind: 'audio' | 'video'
  media: CallMediaState
  className?: string
}) {
  const remoteVideo = useSrcObject<HTMLVideoElement>(kind === 'video' ? media.remote : null)
  const remoteAudio = useSrcObject<HTMLAudioElement>(kind === 'audio' ? media.remote : null)
  const localVideo = useSrcObject<HTMLVideoElement>(kind === 'video' ? media.local : null)
  const hasRemoteVideo = kind === 'video' && !!media.remote?.getVideoTracks().length
  return (
    <div className={className ?? 'call-videos'} data-phase={media.phase}>
      {kind === 'video' ? (
        <>
          <video ref={remoteVideo} className="call-remote" autoPlay playsInline style={{ visibility: hasRemoteVideo ? 'visible' : 'hidden' }} />
          <video ref={localVideo} className="call-local" autoPlay playsInline muted style={{ visibility: media.cameraOff ? 'hidden' : 'visible' }} />
        </>
      ) : (
        <audio ref={remoteAudio} autoPlay />
      )}
    </div>
  )
}

function formatSeconds(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const MicIcon = ({ off }: { off: boolean }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="#fff" aria-hidden="true">
    <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11h-2z" />
    {off && <path d="M4 3l17 17-1.4 1.4L2.6 4.4z" />}
  </svg>
)
const CamIcon = ({ off }: { off: boolean }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="#fff" aria-hidden="true">
    <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z" />
    {off && <path d="M3 3l17 17-1.4 1.4L1.6 4.4z" />}
  </svg>
)

export function CallControls({ kind, media, onToggleMute, onToggleCamera, buttonClass }: {
  kind: 'audio' | 'video'
  media: CallMediaState | null
  onToggleMute: () => void
  onToggleCamera: () => void
  buttonClass?: string
}) {
  if (!media) return null
  return (
    <>
      <button type="button" className={buttonClass ?? 'call7-toggle'} data-on={media.muted ? 'off' : 'on'} onClick={onToggleMute} title={media.muted ? 'Unmute' : 'Mute'} aria-pressed={media.muted}>
        <MicIcon off={media.muted} />
      </button>
      {kind === 'video' && (
        <button type="button" className={buttonClass ?? 'call7-toggle'} data-on={media.cameraOff ? 'off' : 'on'} onClick={onToggleCamera} title={media.cameraOff ? 'Turn camera on' : 'Turn camera off'} aria-pressed={media.cameraOff}>
          <CamIcon off={media.cameraOff} />
        </button>
      )}
    </>
  )
}

export function CallScreen({ state, media, seconds, avatarBg, onAnswer, onHangUp, onToggleMute, onToggleCamera }: {
  state: CallState
  media: CallMediaState | null
  seconds: number
  avatarBg: string
  onAnswer: () => void
  onHangUp: () => void
  onToggleMute: () => void
  onToggleCamera: () => void
}) {
  const ringing = state.status === 'ringing'
  const showVideo = !ringing && state.type === 'video' && !!media?.remote?.getVideoTracks().length
  const phaseText = callPhaseText(media?.phase)
  return (
    <div className="call7">
      <span className="call7-mark">phaze</span>
      {media && !ringing && <CallMedia kind={state.type} media={media} className="call7-media" />}
      {!showVideo && (
        <div className="call7-center">
          <span className="call7-avatar" style={{ background: avatarBg }}>
            {state.peer[0]?.toUpperCase()}
          </span>
          <div className="call7-name">{state.peer}</div>
          <div className="call7-state">
            {ringing && state.direction === 'outgoing' && <>calling<span className="call7-dots"><i>.</i><i>.</i><i>.</i></span></>}
            {ringing && state.direction === 'incoming' && `incoming ${state.type} call`}
            {!ringing && (phaseText ?? formatSeconds(seconds))}
          </div>
        </div>
      )}
      {showVideo && (
        <div className="call7-overlay-state">
          {state.peer} · {phaseText ?? formatSeconds(seconds)}
        </div>
      )}
      <div className="call7-bar">
        {ringing && state.direction === 'incoming' && (
          <button type="button" className="call7-answer" onClick={onAnswer} title="Answer">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1l-2.2 2.2z"/></svg>
          </button>
        )}
        {!ringing && <CallControls kind={state.type} media={media} onToggleMute={onToggleMute} onToggleCamera={onToggleCamera} />}
        <button type="button" className="call7-hangup" onClick={onHangUp} title={ringing && state.direction === 'incoming' ? 'Decline' : 'Hang up'}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M12 9c-2.9 0-5.6.6-8 1.7-.6.3-1 .9-1 1.6v2.3c0 .6.4 1 1 1h3c.6 0 1-.4 1-1v-1.6c1.3-.4 2.6-.6 4-.6s2.7.2 4 .6V14c0 .6.4 1 1 1h3c.6 0 1-.4 1-1v-2.3c0-.7-.4-1.3-1-1.6C17.6 9.6 14.9 9 12 9z"/></svg>
        </button>
      </div>
    </div>
  )
}
