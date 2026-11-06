import { useCallback, useEffect, useRef, useState } from 'react'
import type { NexusMessage, TurnConfig } from './nexusTypes'
import { iceServersFor } from './peerCall'
import './voice.css'
import { VoiceMesh, MAX_VOICE_PEERS, type MeshPeerView, type MediaState } from './voiceMesh'

interface Props {
  me: string
  channelId: string
  channelName: string
  send: (m: NexusMessage) => void
  subscribe: (handler: (m: NexusMessage) => void) => () => void
  turn: TurnConfig | null
  /** Join straight away (group calls); voice channels wait for a click. */
  autoJoin?: boolean
  /** Called after leaving, so a group call overlay can close itself. */
  onLeave?: () => void
  /** Offer a camera. Group video arrived later than group voice, so an
   *  earlier era's group call is voice only. Defaults to true. */
  allowVideo?: boolean
  /** Offer screen sharing (from the era that introduced it). Defaults to true. */
  allowScreenShare?: boolean
  /** Turn the camera on as soon as the call connects (a video call). */
  startWithCamera?: boolean
}

type Phase = 'idle' | 'joining' | 'joined'

let sharedAudioCtx: AudioContext | null = null
function audioCtx(): AudioContext | null {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!sharedAudioCtx) sharedAudioCtx = new Ctor()
  return sharedAudioCtx
}

/** True while there's sound on the stream's audio track. */
function useSpeaking(stream: MediaStream | null, enabled: boolean): boolean {
  const [speaking, setSpeaking] = useState(false)
  useEffect(() => {
    if (!stream || !enabled || !stream.getAudioTracks().length) return
    const ctx = audioCtx()
    if (!ctx) return
    void ctx.resume().catch(() => {})
    let src: MediaStreamAudioSourceNode
    try {
      src = ctx.createMediaStreamSource(stream)
    } catch {
      return
    }
    const an = ctx.createAnalyser()
    an.fftSize = 512
    src.connect(an)
    const buf = new Uint8Array(an.fftSize)
    const id = setInterval(() => {
      an.getByteTimeDomainData(buf)
      let sum = 0
      for (const v of buf) sum += (v - 128) * (v - 128)
      setSpeaking(Math.sqrt(sum / buf.length) > 6)
    }, 150)
    return () => {
      clearInterval(id)
      src.disconnect()
      an.disconnect()
      setSpeaking(false)
    }
  }, [stream, enabled])
  return speaking
}

function MediaEl({ stream, video, muted }: { stream: MediaStream; video: boolean; muted?: boolean }) {
  const ref = useRef<HTMLMediaElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (el.srcObject !== stream) el.srcObject = stream
    void el.play().catch(() => {})
  }, [stream, video])
  return video
    ? <video ref={(el) => { ref.current = el }} className="voice-video" autoPlay playsInline muted={muted} />
    : <audio ref={(el) => { ref.current = el }} autoPlay muted={muted} />
}

function PeerTile({ name, stream, state, connecting, isMe, video, audioStream }: {
  name: string
  stream: MediaStream
  state: MediaState
  connecting: boolean
  isMe: boolean
  video: boolean
  audioStream: MediaStream | null
}) {
  const speaking = useSpeaking(audioStream, state.mic)
  return (
    <div className={`voice-peer${isMe ? ' me' : ''}${video ? ' has-video' : ''}${speaking ? ' speaking' : ''}`}>
      {/* A remote tile plays the person's voice from its <video> or <audio>; your own tile stays silent. */}
      {video ? (
        <MediaEl stream={stream} video muted={isMe} />
      ) : (
        <>
          {!isMe && <MediaEl stream={stream} video={false} />}
          <span className="voice-avatar">{name[0]?.toUpperCase()}</span>
        </>
      )}
      <span className="voice-name">{isMe ? `${name} (you)` : name}{state.screen ? ' · sharing screen' : ''}</span>
      {!state.mic && <span className="voice-mute-pip" title="Muted">🔇</span>}
      {connecting && <span className="voice-conn">connecting…</span>}
    </div>
  )
}

export default function VoiceRoom({ me, channelId, channelName, send, subscribe, turn, autoJoin, onLeave, allowVideo = true, allowScreenShare = true, startWithCamera = false }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [err, setErr] = useState('')
  const [mesh, setMesh] = useState<VoiceMesh | null>(null)
  const [, setTick] = useState(0)
  const meshRef = useRef<VoiceMesh | null>(null)
  const turnRef = useRef(turn)
  useEffect(() => { turnRef.current = turn }, [turn])

  const rerender = useCallback(() => setTick((n) => n + 1), [])

  const teardown = useCallback(() => {
    const m = meshRef.current
    meshRef.current = null
    if (m) {
      m.close()
      send({ type: 'voice_leave', channel_id: channelId })
    }
  }, [send, channelId])

  const join = useCallback(async () => {
    if (meshRef.current) return
    setErr('')
    setPhase('joining')
    const m = new VoiceMesh(me, iceServersFor(turnRef.current), {
      signal: (s) => send({
        type: 'voice_signal',
        channel_id: channelId,
        recipient: s.to,
        body: s.body,
        sdp: s.sdp,
        candidate: s.candidate,
      }),
      onChange: rerender,
      onError: (msg) => setErr(msg),
    })
    meshRef.current = m
    const ok = await m.start()
    if (meshRef.current !== m) return
    if (!ok) {
      meshRef.current = null
      m.close()
      setPhase('idle')
      return
    }
    send({ type: 'voice_join', channel_id: channelId })
    setMesh(m)
    setPhase('joined')
    if (startWithCamera && allowVideo) void m.setCamera(true)
  }, [me, send, channelId, rerender, startWithCamera, allowVideo])

  const leave = useCallback(() => {
    teardown()
    setMesh(null)
    setPhase('idle')
    onLeave?.()
  }, [teardown, onLeave])

  // Signalling from the server for this room.
  useEffect(() => subscribe((msg) => {
    if (msg.channel_id !== channelId) return
    const m = meshRef.current
    if (msg.type === 'voice_peers') {
      if (msg.error) {
        setErr(msg.error)
        if (m) {
          meshRef.current = null
          m.close()
          setMesh(null)
          setPhase('idle')
        }
        return
      }
      m?.setPeers(msg.results ?? [])
    } else if (msg.type === 'voice_signal' && m && msg.sender && msg.body) {
      void m.handle(msg.sender, msg.body, msg.sdp, msg.candidate)
    }
  }), [subscribe, channelId])

  useEffect(() => {
    if (autoJoin) void join()
  }, [autoJoin, join])

  // Switching channel or closing the overlay hangs up.
  useEffect(() => () => teardown(), [teardown])

  const local = mesh?.localState ?? { mic: true, cam: false, screen: false }
  const peers: MeshPeerView[] = mesh?.peerViews() ?? []
  const showLocalVideo = local.cam || local.screen

  return (
    <div className="voice-room">
      <header className="voice-head">
        <h2><span className="hash">🎙</span>{channelName}</h2>
        <p className="voice-sub">
          {phase === 'joined'
            ? `${peers.length + 1} in the room · audio and video go directly between you, not through Phaze`
            : `Up to ${MAX_VOICE_PEERS} people. Audio and video go directly between members.`}
        </p>
      </header>

      {phase === 'joined' && mesh ? (
        <div className="voice-peers">
          <PeerTile
            name={me}
            stream={mesh.preview}
            state={local}
            connecting={false}
            isMe
            video={showLocalVideo}
            audioStream={mesh.localAudio}
          />
          {peers.map((p) => {
            const video = (p.state.cam || p.state.screen) && p.stream.getVideoTracks().some((t) => !t.muted)
            return (
              <PeerTile
                key={p.name}
                name={p.name}
                stream={p.stream}
                state={p.state}
                connecting={p.connection !== 'connected'}
                isMe={false}
                video={video}
                audioStream={p.stream}
              />
            )
          })}
        </div>
      ) : (
        <div className="voice-peers voice-empty">
          <p className="voice-sub">{phase === 'joining' ? 'Opening your microphone…' : 'You’re not in this room.'}</p>
        </div>
      )}

      {err && <p className="voice-err" role="alert">{err}</p>}

      <div className="voice-controls">
        {phase === 'joined' && mesh ? (
          <>
            <button type="button" className={`voice-mute-btn${local.mic ? '' : ' active'}`} onClick={() => mesh.setMuted(local.mic)}>
              {local.mic ? 'Mute' : 'Unmute'}
            </button>
            {allowVideo && (
              <button type="button" className={`voice-mute-btn${local.cam ? ' active' : ''}`} onClick={() => void mesh.setCamera(!local.cam)} disabled={local.screen}>
                {local.cam ? 'Camera off' : 'Camera on'}
              </button>
            )}
            {allowScreenShare && (
              <button type="button" className={`voice-mute-btn${local.screen ? ' active' : ''}`} onClick={() => void mesh.setScreenShare(!local.screen)}>
                {local.screen ? 'Stop sharing' : 'Share screen'}
              </button>
            )}
            <button type="button" className="voice-leave-btn" onClick={leave}>Leave</button>
          </>
        ) : (
          <>
            <button type="button" className="voice-join-btn" onClick={() => void join()} disabled={phase === 'joining'}>
              {phase === 'joining' ? 'Joining…' : 'Join voice'}
            </button>
            {onLeave && <button type="button" className="voice-leave-btn" onClick={leave}>Close</button>}
          </>
        )}
      </div>
    </div>
  )
}
