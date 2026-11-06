// One-to-one calls run directly between the two browsers over WebRTC.
//
// The server only rings, pairs the two connections and relays signalling
// (call_accepted, then call_signal with offer/answer/ice — see
// nexus_server/ws_handlers.go). Media goes peer to peer, or through the TURN
// relay the server hands out in turn_config when a direct path isn't possible.

import type { TurnConfig } from './nexusTypes'

export type CallKind = 'audio' | 'video'
export type CallRole = 'caller' | 'callee'
export type SignalKind = 'offer' | 'answer' | 'ice'

export interface CallSignal {
  body: SignalKind
  sdp?: string
  candidate?: string
}

export type PeerCallPhase = 'starting' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'closed'

export interface PeerCallEvents {
  /** Send a call_signal to the other side. */
  signal: (s: CallSignal) => void
  onLocalStream: (s: MediaStream) => void
  onRemoteStream: (s: MediaStream) => void
  onPhase: (p: PeerCallPhase) => void
  /** Camera or microphone couldn't be opened; the call can't go on. */
  onMediaError: (message: string) => void
}

/** Public STUN servers, always offered next to any TURN relay. */
const STUN: RTCIceServer = { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }

export function iceServersFor(turn: TurnConfig | null | undefined): RTCIceServer[] {
  const servers: RTCIceServer[] = [STUN]
  if (turn?.url) {
    servers.push({ urls: [turn.url, ...(turn.urls ?? [])], username: turn.username, credential: turn.password })
  }
  return servers
}

export function mediaConstraints(kind: CallKind): MediaStreamConstraints {
  return {
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: kind === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
  }
}

export function mediaErrorMessage(e: unknown, kind: CallKind): string {
  const name = (e as { name?: string })?.name
  const what = kind === 'video' ? 'camera and microphone' : 'microphone'
  if (name === 'NotAllowedError' || name === 'SecurityError') return `Phaze needs permission to use your ${what} for calls.`
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return `No ${what} found on this device.`
  if (name === 'NotReadableError') return `Your ${what} is in use by another app.`
  return `Couldn't open your ${what}.`
}

/** Short status line for the call screen, or null once the call is up. */
export function callPhaseText(phase: PeerCallPhase | undefined): string | null {
  switch (phase) {
    case 'starting': return 'starting…'
    case 'connecting': return 'connecting…'
    case 'reconnecting': return 'reconnecting…'
    case 'failed': return 'call dropped'
    default: return null
  }
}

export class PeerCall {
  private pc: RTCPeerConnection | null = null
  private local: MediaStream | null = null
  private remote = new MediaStream()
  private ready = false
  private queued: CallSignal[] = []
  private pendingIce: RTCIceCandidateInit[] = []
  private restarted = false
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null
  private closed = false

  readonly kind: CallKind
  readonly role: CallRole
  private readonly iceServers: RTCIceServer[]
  private readonly ev: PeerCallEvents

  constructor(kind: CallKind, role: CallRole, iceServers: RTCIceServer[], ev: PeerCallEvents) {
    this.kind = kind
    this.role = role
    this.iceServers = iceServers
    this.ev = ev
  }

  /** Opens the microphone (and camera), then, as the caller, makes the offer. */
  async start(): Promise<void> {
    this.ev.onPhase('starting')
    try {
      this.local = await navigator.mediaDevices.getUserMedia(mediaConstraints(this.kind))
    } catch (e) {
      if (this.closed) return
      this.ev.onMediaError(mediaErrorMessage(e, this.kind))
      return
    }
    if (this.closed) {
      this.local.getTracks().forEach((t) => t.stop())
      return
    }
    this.ev.onLocalStream(this.local)

    const pc = new RTCPeerConnection({ iceServers: this.iceServers })
    this.pc = pc
    for (const track of this.local.getTracks()) pc.addTrack(track, this.local)
    pc.ontrack = (e) => {
      if (!this.remote.getTracks().includes(e.track)) this.remote.addTrack(e.track)
      this.ev.onRemoteStream(this.remote)
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) this.ev.signal({ body: 'ice', candidate: JSON.stringify(e.candidate.toJSON()) })
    }
    pc.onconnectionstatechange = () => this.onConnectionState()
    this.ev.onPhase('connecting')

    if (this.role === 'caller') await this.makeOffer(false)
    this.ready = true
    const queued = this.queued
    this.queued = []
    for (const s of queued) await this.handle(s)
  }

  /** Feeds in a call_signal from the other side. */
  async handle(s: CallSignal): Promise<void> {
    if (this.closed) return
    if (!this.ready || !this.pc) {
      this.queued.push(s)
      return
    }
    const pc = this.pc
    try {
      if (s.body === 'offer' && s.sdp) {
        await pc.setRemoteDescription({ type: 'offer', sdp: s.sdp })
        await this.flushIce()
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        this.ev.signal({ body: 'answer', sdp: pc.localDescription?.sdp ?? answer.sdp ?? '' })
      } else if (s.body === 'answer' && s.sdp) {
        if (pc.signalingState !== 'have-local-offer') return
        await pc.setRemoteDescription({ type: 'answer', sdp: s.sdp })
        await this.flushIce()
      } else if (s.body === 'ice' && s.candidate) {
        const cand = JSON.parse(s.candidate) as RTCIceCandidateInit
        if (pc.remoteDescription) await pc.addIceCandidate(cand)
        else this.pendingIce.push(cand)
      }
    } catch (e) {
      console.warn('[call] signal failed', s.body, e)
    }
  }

  setMuted(muted: boolean) {
    this.local?.getAudioTracks().forEach((t) => { t.enabled = !muted })
  }

  setCameraOff(off: boolean) {
    this.local?.getVideoTracks().forEach((t) => { t.enabled = !off })
  }

  close() {
    if (this.closed) return
    this.closed = true
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer)
    this.local?.getTracks().forEach((t) => t.stop())
    this.pc?.close()
    this.pc = null
    this.ev.onPhase('closed')
  }

  private async makeOffer(iceRestart: boolean) {
    const pc = this.pc
    if (!pc) return
    const offer = await pc.createOffer({ iceRestart })
    await pc.setLocalDescription(offer)
    this.ev.signal({ body: 'offer', sdp: pc.localDescription?.sdp ?? offer.sdp ?? '' })
  }

  private async flushIce() {
    const pc = this.pc
    if (!pc) return
    const list = this.pendingIce
    this.pendingIce = []
    for (const c of list) {
      try { await pc.addIceCandidate(c) } catch (e) { console.warn('[call] ice', e) }
    }
  }

  private onConnectionState() {
    const pc = this.pc
    if (!pc || this.closed) return
    const st = pc.connectionState
    if (this.disconnectTimer && st !== 'disconnected') {
      clearTimeout(this.disconnectTimer)
      this.disconnectTimer = null
    }
    if (st === 'connected') {
      this.ev.onPhase('connected')
    } else if (st === 'disconnected') {
      this.ev.onPhase('reconnecting')
      // A brief network blip often recovers by itself; if it doesn't, the
      // caller renegotiates with fresh ICE.
      this.disconnectTimer = setTimeout(() => this.tryRestart(), 4000)
    } else if (st === 'failed') {
      this.tryRestart()
    }
  }

  private tryRestart() {
    if (this.closed || !this.pc) return
    if (this.restarted) {
      this.ev.onPhase('failed')
      return
    }
    this.restarted = true
    this.ev.onPhase('reconnecting')
    if (this.role === 'caller') void this.makeOffer(true)
    // The callee waits for the caller's new offer.
  }
}
