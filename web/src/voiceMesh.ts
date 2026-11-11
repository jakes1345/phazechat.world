// Voice rooms (Spaces voice channels and group calls) run as a small mesh:
// every person in the room has one direct WebRTC connection to every other
// person. The server only keeps the member list (voice_peers) and relays
// signalling between members (voice_signal). Media never passes through
// Phaze's server: it goes browser to browser, or through the TURN relay from
// turn_config when two networks can't reach each other directly.
//
// Each connection always carries one audio and one video transceiver, so
// turning the camera on or sharing the screen is a replaceTrack on the
// existing sender and never needs a new offer.

import { mediaErrorMessage } from './peerCall'

/** Mesh rooms get heavy fast: every member uploads a stream to every other. */
export const MAX_VOICE_PEERS = 8

export type MeshSignalKind = 'offer' | 'answer' | 'ice' | 'media'

export interface MeshSignal {
  to: string
  body: MeshSignalKind
  sdp?: string
  candidate?: string
}

/** What a member is sending, shared with the others over voice_signal "media". */
export interface MediaState {
  mic: boolean
  cam: boolean
  screen: boolean
}

export interface MeshPeerView {
  name: string
  stream: MediaStream
  state: MediaState
  connection: RTCPeerConnectionState | 'new'
}

export interface VoiceMeshEvents {
  signal: (s: MeshSignal) => void
  /** Called whenever the local preview, the peer list or any peer's media changes. */
  onChange: () => void
  onError: (message: string) => void
}

/**
 * Which side of a pair makes the offer. Both sides compute the same answer
 * from the two names, so two members never offer to each other at once.
 */
export function isOfferer(me: string, peer: string): boolean {
  return me < peer
}

/** Diffs the server's member list against the open connections. */
export function diffPeers(me: string, current: Iterable<string>, listed: string[]): { add: string[]; remove: string[] } {
  const want = new Set(listed.filter((p) => p && p !== me))
  const have = new Set(current)
  return {
    add: [...want].filter((p) => !have.has(p)).sort(),
    remove: [...have].filter((p) => !want.has(p)).sort(),
  }
}

export function parseMediaState(raw: string | undefined): MediaState | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<MediaState>
    return { mic: v.mic !== false, cam: v.cam === true, screen: v.screen === true }
  } catch {
    return null
  }
}

interface PeerLink {
  name: string
  pc: RTCPeerConnection
  stream: MediaStream
  state: MediaState
  audio: RTCRtpTransceiver | null
  video: RTCRtpTransceiver | null
  pendingIce: RTCIceCandidateInit[]
  restarted: boolean
  disconnectTimer: ReturnType<typeof setTimeout> | null
}

export class VoiceMesh {
  private readonly me: string
  private readonly iceServers: RTCIceServer[]
  private readonly ev: VoiceMeshEvents
  private peers = new Map<string, PeerLink>()
  private mic: MediaStreamTrack | null = null
  private cam: MediaStreamTrack | null = null
  private screen: MediaStreamTrack | null = null
  private micStream: MediaStream | null = null
  private closed = false
  /** Local preview: the camera or the shared screen, whichever is being sent. */
  readonly preview = new MediaStream()

  constructor(me: string, iceServers: RTCIceServer[], ev: VoiceMeshEvents) {
    this.me = me
    this.iceServers = iceServers
    this.ev = ev
  }

  /** Opens the microphone. Returns false if it couldn't be opened. */
  async start(): Promise<boolean> {
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      })
    } catch (e) {
      this.ev.onError(mediaErrorMessage(e, 'audio'))
      return false
    }
    if (this.closed) {
      this.micStream.getTracks().forEach((t) => t.stop())
      return false
    }
    this.mic = this.micStream.getAudioTracks()[0] ?? null
    return true
  }

  get localState(): MediaState {
    return { mic: !!this.mic?.enabled, cam: !!this.cam && !this.screen, screen: !!this.screen }
  }

  get localAudio(): MediaStream | null {
    return this.micStream
  }

  peerViews(): MeshPeerView[] {
    return [...this.peers.values()]
      .map((p) => ({ name: p.name, stream: p.stream, state: p.state, connection: p.pc.connectionState }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  /** Applies a voice_peers list from the server. */
  setPeers(listed: string[]) {
    if (this.closed) return
    const { add, remove } = diffPeers(this.me, this.peers.keys(), listed)
    for (const name of remove) this.dropPeer(name)
    for (const name of add) {
      const link = this.openPeer(name)
      if (isOfferer(this.me, name)) void this.makeOffer(link, false)
    }
    if (add.length || remove.length) this.ev.onChange()
  }

  /** Feeds in a voice_signal from another member. */
  async handle(from: string, body: string, sdp?: string, candidate?: string) {
    if (this.closed || !from || from === this.me) return
    let link = this.peers.get(from)
    if (body === 'offer' && !link) link = this.openPeer(from)
    if (!link) return
    const pc = link.pc
    try {
      if (body === 'offer' && sdp) {
        await pc.setRemoteDescription({ type: 'offer', sdp })
        this.bindTransceivers(link)
        await this.flushIce(link)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        this.ev.signal({ to: from, body: 'answer', sdp: pc.localDescription?.sdp ?? answer.sdp ?? '' })
        this.sendState(from)
      } else if (body === 'answer' && sdp) {
        if (pc.signalingState !== 'have-local-offer') return
        await pc.setRemoteDescription({ type: 'answer', sdp })
        await this.flushIce(link)
        this.sendState(from)
      } else if (body === 'ice' && candidate) {
        const cand = JSON.parse(candidate) as RTCIceCandidateInit
        if (pc.remoteDescription) await pc.addIceCandidate(cand)
        else link.pendingIce.push(cand)
      } else if (body === 'media') {
        const st = parseMediaState(sdp)
        if (st) {
          link.state = st
          this.ev.onChange()
        }
      }
    } catch (e) {
      console.warn('[voice] signal failed', from, body, e)
    }
  }

  setMuted(muted: boolean) {
    if (this.mic) this.mic.enabled = !muted
    this.broadcastState()
    this.ev.onChange()
  }

  async setCamera(on: boolean): Promise<void> {
    if (on && !this.cam) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: 'user' } })
        this.cam = s.getVideoTracks()[0] ?? null
      } catch (e) {
        this.ev.onError(mediaErrorMessage(e, 'video').replace('camera and microphone', 'camera'))
        return
      }
      if (this.closed) {
        this.cam?.stop()
        this.cam = null
        return
      }
    } else if (!on && this.cam) {
      this.cam.stop()
      this.cam = null
    }
    await this.applyVideo()
  }

  async setScreenShare(on: boolean): Promise<void> {
    if (on && !this.screen) {
      if (!navigator.mediaDevices.getDisplayMedia) {
        this.ev.onError('This browser can’t share its screen.')
        return
      }
      try {
        const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
        this.screen = s.getVideoTracks()[0] ?? null
      } catch {
        // Picking "Cancel" in the browser's share dialog lands here; nothing to report.
        return
      }
      if (!this.screen) return
      if (this.closed) {
        this.screen.stop()
        this.screen = null
        return
      }
      // The browser's own "Stop sharing" bar ends the track.
      this.screen.onended = () => { void this.setScreenShare(false) }
    } else if (!on && this.screen) {
      this.screen.onended = null
      this.screen.stop()
      this.screen = null
    }
    await this.applyVideo()
  }

  close() {
    if (this.closed) return
    this.closed = true
    for (const name of [...this.peers.keys()]) this.dropPeer(name)
    this.micStream?.getTracks().forEach((t) => t.stop())
    this.cam?.stop()
    this.screen?.stop()
    this.mic = this.cam = this.screen = null
  }

  private outgoingVideo(): MediaStreamTrack | null {
    return this.screen ?? this.cam
  }

  private async applyVideo() {
    const track = this.outgoingVideo()
    for (const t of this.preview.getVideoTracks()) this.preview.removeTrack(t)
    if (track) this.preview.addTrack(track)
    await Promise.all([...this.peers.values()].map(async (link) => {
      try {
        await link.video?.sender.replaceTrack(track)
      } catch (e) {
        console.warn('[voice] replaceTrack', link.name, e)
      }
    }))
    this.broadcastState()
    this.ev.onChange()
  }

  private openPeer(name: string): PeerLink {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers })
    const link: PeerLink = {
      name,
      pc,
      stream: new MediaStream(),
      state: { mic: true, cam: false, screen: false },
      audio: null,
      video: null,
      pendingIce: [],
      restarted: false,
      disconnectTimer: null,
    }
    this.peers.set(name, link)
    if (isOfferer(this.me, name)) {
      link.audio = pc.addTransceiver('audio', { direction: 'sendrecv' })
      link.video = pc.addTransceiver('video', { direction: 'sendrecv' })
      void link.audio.sender.replaceTrack(this.mic)
      void link.video.sender.replaceTrack(this.outgoingVideo())
    }
    pc.ontrack = (e) => {
      if (!link.stream.getTracks().includes(e.track)) link.stream.addTrack(e.track)
      e.track.onunmute = () => this.ev.onChange()
      e.track.onmute = () => this.ev.onChange()
      this.ev.onChange()
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) this.ev.signal({ to: name, body: 'ice', candidate: JSON.stringify(e.candidate.toJSON()) })
    }
    pc.onconnectionstatechange = () => this.onConnectionState(link)
    return link
  }

  /** The answering side picks up the transceivers the offer created. */
  private bindTransceivers(link: PeerLink) {
    if (link.audio && link.video) return
    for (const t of link.pc.getTransceivers()) {
      const kind = t.receiver.track.kind
      if (kind === 'audio' && !link.audio) {
        link.audio = t
        t.direction = 'sendrecv'
        void t.sender.replaceTrack(this.mic)
      } else if (kind === 'video' && !link.video) {
        link.video = t
        t.direction = 'sendrecv'
        void t.sender.replaceTrack(this.outgoingVideo())
      }
    }
  }

  private async makeOffer(link: PeerLink, iceRestart: boolean) {
    const pc = link.pc
    try {
      const offer = await pc.createOffer({ iceRestart })
      await pc.setLocalDescription(offer)
      this.ev.signal({ to: link.name, body: 'offer', sdp: pc.localDescription?.sdp ?? offer.sdp ?? '' })
    } catch (e) {
      console.warn('[voice] offer failed', link.name, e)
    }
  }

  private async flushIce(link: PeerLink) {
    const list = link.pendingIce
    link.pendingIce = []
    for (const c of list) {
      try { await link.pc.addIceCandidate(c) } catch (e) { console.warn('[voice] ice', e) }
    }
  }

  private onConnectionState(link: PeerLink) {
    if (this.closed || this.peers.get(link.name) !== link) return
    const st = link.pc.connectionState
    if (link.disconnectTimer && st !== 'disconnected') {
      clearTimeout(link.disconnectTimer)
      link.disconnectTimer = null
    }
    if (st === 'connected') {
      link.restarted = false
    } else if (st === 'disconnected') {
      link.disconnectTimer = setTimeout(() => this.restart(link), 4000)
    } else if (st === 'failed') {
      this.restart(link)
    }
    this.ev.onChange()
  }

  private restart(link: PeerLink) {
    if (this.closed || link.restarted) return
    link.restarted = true
    // The offering side renegotiates with fresh ICE; the other side answers it.
    if (isOfferer(this.me, link.name)) void this.makeOffer(link, true)
  }

  private sendState(to: string) {
    this.ev.signal({ to, body: 'media', sdp: JSON.stringify(this.localState) })
  }

  private broadcastState() {
    for (const name of this.peers.keys()) this.sendState(name)
  }

  private dropPeer(name: string) {
    const link = this.peers.get(name)
    if (!link) return
    if (link.disconnectTimer) clearTimeout(link.disconnectTimer)
    link.pc.ontrack = null
    link.pc.onicecandidate = null
    link.pc.onconnectionstatechange = null
    link.pc.close()
    link.stream.getTracks().forEach((t) => t.stop())
    this.peers.delete(name)
  }
}
