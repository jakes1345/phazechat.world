import React, { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, startTransition } from 'react'
import faviconUrl from '/icon-192.png'
import jsQR from 'jsqr'
import type { NexusMessage, TurnConfig } from './nexusTypes'
import {
  decryptFromPeer,
  decodePublicKeyField,
  encryptForPeer,
  encodePublicKeyB64,
  fingerprint,
  generateKeyPair,
} from './e2ee'
import { loadPins, savePins } from './keyPins'
import { encryptKeypair as encryptKeyBackup } from './keyBackup'
import { playPhazeSound, phazeSoundUrl } from './phazeSounds'
import { PresenceIcon } from './PresenceIcon'
import { STATUSES, IDLE_MS, effectiveStatus, type UserStatus } from './presence'
import { MoodEditor } from './MoodEditor'
import { ContactsView } from './ContactsView'
import { tokenize as tokenizeEmoticons } from './emoticons'
import { Emoticon } from './emoticonArt'
import { EmoticonPicker } from './EmoticonPicker'
import { CallScreen } from './CallScreen'
import { SELECTABLE_THEMES, type ThemeId, isThemeId, resolveTheme, nextTheme, themeIcon, themeLabel, hasFeature, isClassicSkype, isSkypeEra } from './themes'
import OSChrome from './OSChrome'
const Spaces = lazy(() => import('./Spaces'))
const LivePage = lazy(() => import('./LivePage'))
const VoiceRoom = lazy(() => import('./VoiceRoom'))
const Stories = lazy(() => import('./Stories'))
const Onboarding = lazy(() => import('./Onboarding'))
const RemoteControl = lazy(() => import('./RemoteControl'))
import UserProfile from './UserProfile'
import SupportBubble from './SupportBubble'
import SupportForm from './SupportForm'
import Settings from './Settings'
import DesktopTitleBar from './DesktopTitleBar'
import { AvatarImg } from './AvatarImg'
import GroupChat from './GroupChat'
import './App.css'

// Wails desktop bridge — only present when running inside the Wails desktop app.
const wails = (() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = window as any
  if (typeof g?.go?.main?.App?.Notify === 'function') return g.go.main.App as {
    Notify: (title: string, body: string) => void
    SetUnread: (count: number) => void
    WindowMinimise: () => void
    WindowToggleMaximise: () => void
    WindowClose: () => void
  }
  return null
})()

const SESSION_KEY = 'phaze_session_token_v1'
const KEYS_KEY = 'phaze_nacl_keys_v1'
const MUTED_PEERS_KEY = 'phaze_muted_peers_v1'

function loadMutedPeers(): Set<string> {
  try {
    const raw = localStorage.getItem(MUTED_PEERS_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch { /* ignore */ }
  return new Set()
}
function saveMutedPeers(s: Set<string>) {
  try { localStorage.setItem(MUTED_PEERS_KEY, JSON.stringify([...s])) } catch { /* ignore */ }
}
function isPeerMuted(peer: string): boolean {
  return loadMutedPeers().has(peer)
}
const THEME_KEY = 'phaze_theme_v1'
const SNOW_KEY = 'phaze_snow_v1'
const OSFRAME_KEY = 'phaze_osframe_v1'
const STATUS_KEY = 'phaze_status_v1'

const SNOW_FLAKES = Array.from({ length: 40 }, (_, i) => ({
  i,
  left: Math.random() * 100,
  dur: 6 + Math.random() * 8,
  delay: -Math.random() * 14,
  size: 0.6 + Math.random() * 1.1,
}))

/** Seasonal snow overlay. */
function Snowflakes() {
  return (
    <div className="snow-layer" aria-hidden="true">
      {SNOW_FLAKES.map(({ i, left, dur, delay, size }) => (
        <i key={i} style={{ left: `${left}vw`, animationDuration: `${dur}s`, animationDelay: `${delay}s`, fontSize: `${size}rem` }}>❄</i>
      ))}
    </div>
  )
}
/** Person icon for the sidebar Contacts tab — hand-drawn, no external asset. */
function IconPerson() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20c1.4-3.6 4.2-5.4 7.5-5.4s6.1 1.8 7.5 5.4" strokeLinecap="round" />
    </svg>
  )
}

/** Clock icon for the sidebar Recent tab — hand-drawn, no external asset. */
function IconClock() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" strokeLinecap="round" />
    </svg>
  )
}

/** Flat "live" dot icon for the sidebar Live tab — hand-drawn, no external asset. */
function IconLive() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="#E4141B">
      <circle cx="12" cy="12" r="10" />
    </svg>
  )
}

const HISTORY_LIMIT = 500
const historyKey = (me: string, peer: string) => `phaze_chat_${me}_${peer}_v1`
const unreadKey = (me: string) => `phaze_unread_${me}_v1`

const EMOJIS = ['😀','😂','😍','😎','🤔','😢','😡','👍','👎','❤️','🔥','🎉','🙏','👀','💯','✨','😅','🥹','😴','🤝','🚀','👋','🤣','😭']

function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const hue = h % 360
  return `hsl(${hue} 65% 50%)`
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const week = 7 * 24 * 60 * 60 * 1000
  if (now.getTime() - ts < week) return d.toLocaleDateString([], { weekday: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function loadHistory(me: string, peer: string): ChatLine[] {
  try {
    const raw = localStorage.getItem(historyKey(me, peer))
    if (!raw) return []
    const arr = JSON.parse(raw) as ChatLine[]
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function saveHistory(me: string, peer: string, lines: ChatLine[]) {
  try {
    const trimmed = lines.slice(-HISTORY_LIMIT)
    localStorage.setItem(historyKey(me, peer), JSON.stringify(trimmed))
  } catch { /* quota */ }
}

function loadUnread(me: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(unreadKey(me))
    return raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch { return {} }
}

function saveUnread(me: string, u: Record<string, number>) {
  try { localStorage.setItem(unreadKey(me), JSON.stringify(u)) } catch { /* quota */ }
}

async function registerPush(send: (m: NexusMessage) => void) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  try {
    const reg = await navigator.serviceWorker.register('/web/sw.js', { scope: '/web/' })
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return
    const resp = await fetch('/api/v1/vapid-key')
    if (!resp.ok) return
    const { publicKey } = await resp.json() as { publicKey: string }
    if (!publicKey) return
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: publicKey,
    })
    const json = sub.toJSON()
    send({
      type: 'subscribe_push',
      body: JSON.stringify({
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
      }),
    })
  } catch (e) {
    console.warn('[push] registration failed', e)
  }
}

type FileAttachment = { url: string; name: string; mime: string; size: number }
type ChatLine = {
  id: string
  from: string
  text: string
  me: boolean
  ts: number
  edited?: boolean
  deleted?: boolean
  reactions?: Record<string, string[]> // emoji -> users
  file?: FileAttachment
  seen?: boolean // peer has opened the conversation since this message was sent
  callInfo?: { kind: string; status: 'answered' | 'missed'; duration: number } // present on call-history lines
}

const FILE_PREFIX = 'phaze-file'

function encodeFileBody(att: FileAttachment): string {
  return FILE_PREFIX + JSON.stringify(att)
}

function decodeFileBody(text: string): FileAttachment | null {
  if (!text.startsWith(FILE_PREFIX)) return null
  try {
    const a = JSON.parse(text.slice(FILE_PREFIX.length)) as FileAttachment
    if (a && typeof a.url === 'string' && typeof a.name === 'string') return a
    return null
  } catch { return null }
}

function isImage(mime: string, name: string): boolean {
  if (mime?.startsWith('image/')) return true
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(name)
}

function isAudio(mime: string, name: string): boolean {
  if (mime?.startsWith('audio/')) return true
  return /\.(mp3|m4a|ogg|wav|opus)$/i.test(name)
}

function isVideo(mime: string, name: string): boolean {
  if (mime?.startsWith('video/')) return true
  return /\.(mp4|mov|webm|mkv|avi)$/i.test(name)
}

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function newMsgId(): string {
  const a = new Uint8Array(12)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function dateSepLabel(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  const yest = new Date(); yest.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yest.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

const REACTION_EMOJIS = ['👍','❤️','😂','😮','😢','🔥']

interface SlashCmd {
  cmd: string
  desc: string
  // run returns the replacement text to send. Empty string means do nothing.
  run: (arg: string) => string | { local: string }
}

const SLASH_COMMANDS: SlashCmd[] = [
  { cmd: '/me', desc: 'Send a third-person action message', run: (a) => `*${a}*` },
  { cmd: '/shrug', desc: 'Append ¯\\_(ツ)_/¯', run: (a) => `${a} ¯\\_(ツ)_/¯`.trim() },
  { cmd: '/tableflip', desc: 'Flip a table', run: (a) => `${a} (╯°□°）╯︵ ┻━┻`.trim() },
  { cmd: '/unflip', desc: 'Put the table back', run: (a) => `${a} ┬─┬ ノ( ゜-゜ノ)`.trim() },
  { cmd: '/lenny', desc: 'Send a lenny face', run: (a) => `${a} ( ͡° ͜ʖ ͡°)`.trim() },
  { cmd: '/clear', desc: 'Clear the conversation view (local only)', run: () => ({ local: 'clear' }) },
  { cmd: '/help', desc: 'List available slash commands', run: () => ({ local: 'help' }) },
]

function relTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'now'
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))}h`
  const d = new Date(ts)
  const days = Math.floor(diff / (24 * 60 * 60_000))
  if (days < 7) return `${days}d`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function lastLineFor(me: string | null, peer: string): { text: string; ts: number } | null {
  if (!me) return null
  try {
    const raw = localStorage.getItem(`phaze_chat_${me}_${peer}_v1`)
    if (!raw) return null
    const arr = JSON.parse(raw) as { text: string; ts: number; file?: { name?: string }; deleted?: boolean; me?: boolean }[]
    if (!arr.length) return null
    const last = arr[arr.length - 1]
    let text = last.text || ''
    if (last.deleted) text = '[deleted]'
    else if (last.file?.name) text = `📎 ${last.file.name}`
    else if (text.startsWith('phaze-file{')) text = '📎 File'
    if (last.me) text = `You: ${text}`
    return { text, ts: last.ts }
  } catch { return null }
}

const MENTION_RE = /@([A-Za-z0-9_]{2,32})/g

const pinKey = (me: string, peer: string) => `phaze_pins_${me}_${peer}_v1`

function loadPinned(me: string, peer: string): string[] {
  try {
    const raw = localStorage.getItem(pinKey(me, peer))
    return raw ? JSON.parse(raw) as string[] : []
  } catch { return [] }
}

function savePinned(me: string, peer: string, ids: string[]) {
  try { localStorage.setItem(pinKey(me, peer), JSON.stringify(ids)) } catch { /* quota */ }
}

type Segment = { kind: 'text' | 'url' | 'mention'; value: string }

function tokenize(text: string): Segment[] {
  if (!text) return []
  const out: Segment[] = []
  // Combined regex preserves order across both URL and @mention matches.
  const combined = /(https?:\/\/[^\s<>"']+[^\s<>"'.,!?:;)])|@([A-Za-z0-9_]{2,32})/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = combined.exec(text)) !== null) {
    if (m.index > last) out.push({ kind: 'text', value: text.slice(last, m.index) })
    if (m[1]) out.push({ kind: 'url', value: m[1] })
    else if (m[2]) out.push({ kind: 'mention', value: m[2] })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ kind: 'text', value: text.slice(last) })
  return out
}

/** Plain-text run with classic emoticon shortcuts swapped for art. */
function EmoticonText({ text }: { text: string }) {
  return (
    <>
      {tokenizeEmoticons(text).map((t, i) =>
        t.kind === 'text' ? <span key={i}>{t.value}</span> : <Emoticon key={i} id={t.id} />)}
    </>
  )
}

function RichText({ text, me }: { text: string; me: string | null }) {
  const segs = useMemo(() => tokenize(text), [text])
  return (
    <>
      {segs.map((s, i) => {
        if (s.kind === 'url') {
          return <a key={i} href={s.value} target="_blank" rel="noopener noreferrer" className="msg-link">{s.value}</a>
        }
        if (s.kind === 'mention') {
          const isMe = me === s.value
          return <span key={i} className={`msg-mention ${isMe ? 'me' : ''}`}>@{s.value}</span>
        }
        return <EmoticonText key={i} text={s.value} />
      })}
    </>
  )
}

function containsMention(text: string, who: string): boolean {
  if (!text || !who) return false
  MENTION_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MENTION_RE.exec(text)) !== null) {
    if (m[1] === who) return true
  }
  return false
}
type CallState = {
  peer: string
  type: 'audio' | 'video'
  status: 'ringing' | 'active'
  direction: 'outgoing' | 'incoming'
}

type ConvoLine = {
  id: string
  sender: string
  body: string
  ts: number
  me: boolean
}

type Convo = {
  id: string
  name: string
  members: string[]
  /** Who made the group. The only person add/remove/rename will work for —
   *  see the convo_add_member/convo_remove_member/convo_rename handlers on
   *  the server, which enforce exactly this and nothing more granular. */
  creator: string
}

function defaultWsUrl(): string {
  const u = import.meta.env.VITE_NEXUS_WS as string | undefined
  if (u) return u
  const { protocol, hostname, port } = window.location
  const p = protocol === 'https:' ? 'wss:' : 'ws:'
  const h = port && protocol !== 'https:' ? `${hostname}:${port}` : hostname
  return `${p}//${h}/ws`
}

function loadOrCreateKeys(): { publicKey: Uint8Array; secretKey: Uint8Array } {
  try {
    const raw = localStorage.getItem(KEYS_KEY)
    if (raw) {
      const j = JSON.parse(raw) as { pub: string; sec: string }
      const pub = Uint8Array.from(atob(j.pub), (c) => c.charCodeAt(0))
      const sec = Uint8Array.from(atob(j.sec), (c) => c.charCodeAt(0))
      if (pub.length === 32 && sec.length === 32) return { publicKey: pub, secretKey: sec }
    }
  } catch {
    /* fallthrough */
  }
  const kp = generateKeyPair()
  localStorage.setItem(
    KEYS_KEY,
    JSON.stringify({
      pub: btoa(String.fromCharCode(...kp.publicKey)),
      sec: btoa(String.fromCharCode(...kp.secretKey)),
    }),
  )
  return kp
}

function statusColor(st: string): string {
  if (st === 'Online') return '#22c55e'
  if (st === 'Away' || st === 'away') return '#f59e0b'
  if (st === 'Do Not Disturb' || st === 'dnd') return '#ef4444'
  return '#94a3b8'
}

export default function App() {
  const wsUrl = useMemo(() => defaultWsUrl(), [])
  const [conn, setConn] = useState<'off' | 'connecting' | 'open'>('off')
  const [wsRetry, setWsRetry] = useState(0)
  const wsRetryDelay = useRef(1000)
  const [me, setMe] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [log, setLog] = useState<ChatLine[]>([])
  const [friends, setFriends] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [pending, setPending] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [e2eReady, setE2eReady] = useState(false)
  const [typingPeers, setTypingPeers] = useState<Set<string>>(new Set())
  const [callState, setCallState] = useState<CallState | null>(null)
  const [callSeconds, setCallSeconds] = useState(0)
  const [jitsiRoom, setJitsiRoom] = useState<string | null>(null)
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auth + registration UI state hoisted above WS handler (ESLint no-use-before-define)
  const [loginUser, setLoginUser] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginTotp, setLoginTotp] = useState('')
  const [needsTotp, setNeedsTotp] = useState(false)
  // A sign-in from an unrecognised device is held until it's approved. This
  // holds the prompt on the NEW device (enter the emailed code); deviceAsk
  // below holds the prompt on sessions that are already signed in.
  const [deviceVerify, setDeviceVerify] = useState<null | { label: string; codeSent: boolean }>(null)
  const [deviceCode, setDeviceCode] = useState('')
  const [deviceAsk, setDeviceAsk] = useState<null | { id: number; label: string; ip: string; ts: number }>(null)
  const [addFriend, setAddFriend] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [addStatus, setAddStatus] = useState<string | null>(null)
  const [contactFilter, setContactFilter] = useState('')
  const [profileUser, setProfileUser] = useState<string | null>(null)
  const [onboardingOpen, setOnboardingOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('phaze_onboarded') !== '1' } catch { return false }
  })
  const [mutedPeers, setMutedPeers] = useState<Set<string>>(() => loadMutedPeers())
  const [bmcUrl, setBmcUrl] = useState('https://buymeacoffee.com/phazeworld')
  const [showSupport, setShowSupport] = useState(false)
  useEffect(() => {
    fetch('/api/v1/config')
      .then((r) => r.ok ? r.json() : null)
      .then((c: { bmc_url?: string } | null) => { if (c?.bmc_url) setBmcUrl(c.bmc_url) })
      .catch(() => { /* keep default */ })
  }, [])
  const togglePeerMute = (peer: string) => {
    setMutedPeers((prev) => {
      const next = new Set(prev)
      if (next.has(peer)) next.delete(peer); else next.add(peer)
      saveMutedPeers(next)
      return next
    })
  }
  const inviteCode = useMemo(() => new URLSearchParams(window.location.search).get('invite'), [])
  const refBy = useMemo(() => new URLSearchParams(window.location.search).get('ref'), [])
  const [mode, setMode] = useState<'login' | 'register' | 'link' | 'forgot'>(() => {
    const p = new URLSearchParams(window.location.search)
    return (p.get('invite') || p.get('ref')) ? 'register' : 'login'
  })
  const [forgotEmail, setForgotEmail] = useState('')
  const [linkInput, setLinkInput] = useState('')
  const [linkBusy, setLinkBusy] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameIdRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current)
      }
    }
  }, [])

  const startCamera = async () => {
    try {
      setErr('')
      setCameraActive(true)
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.setAttribute('playsinline', 'true')
        videoRef.current.play()
        animationFrameIdRef.current = requestAnimationFrame(tick)
      }
    } catch (err) {
      setCameraActive(false)
      setErr('Camera access failed: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const stopCamera = () => {
    setCameraActive(false)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current)
      animationFrameIdRef.current = null
    }
  }

  const tick = () => {
    if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
      animationFrameIdRef.current = requestAnimationFrame(tick)
      return
    }

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (ctx) {
      canvas.width = videoRef.current.videoWidth
      canvas.height = videoRef.current.videoHeight
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      })
      if (code && code.data) {
        handleScannedToken(code.data)
        return
      }
    }
    animationFrameIdRef.current = requestAnimationFrame(tick)
  }

  const handleScannedToken = (val: string) => {
    let tok = val.trim()
    if (tok.includes('token=')) {
      tok = tok.split('token=')[1].split('&')[0]
    }
    if (!/^[a-f0-9]{32,128}$/.test(tok)) { setErr('Invalid QR code format'); return }
    setLinkInput(tok)
    stopCamera()
    setErr('✓ Token scanned: ' + tok)
    setLinkBusy(true)
    const poll = setInterval(() => sendRef.current({ type: 'link_check', token: tok }), 2500)
    sendRef.current({ type: 'link_check', token: tok })
    setTimeout(() => clearInterval(poll), 5 * 60 * 1000)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (ctx) {
          canvas.width = img.width
          canvas.height = img.height
          ctx.drawImage(img, 0, 0)
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(imageData.data, imageData.width, imageData.height)
          if (code && code.data) {
            handleScannedToken(code.data)
          } else {
            setErr('No QR code found in the selected image.')
          }
        }
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }
  const [regStep, setRegStep] = useState<'form' | 'verify' | 'done'>('form')
  const [regUser, setRegUser] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPass, setRegPass] = useState('')
  const [regCode, setRegCode] = useState('')

  const [view, setView] = useState<'contacts' | 'dms' | 'spaces' | 'live'>('dms')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [remoteOpen, setRemoteOpen] = useState(false)
  const [groupCallRoom, setGroupCallRoom] = useState<string | null>(null)
  const [groupCallInvite, setGroupCallInvite] = useState<{ from: string; room: string } | null>(null)
  const [globalNotice, setGlobalNotice] = useState<{ from: string; msg: string } | null>(null)
  const [changelogSeen, setChangelogSeen] = useState(() => localStorage.getItem('phaze_changelog_v') === '2025-05-25')
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [changelogSlide, setChangelogSlide] = useState(0)
  const changelogFeatures = [
    { icon: '🖥', title: 'Remote Control', desc: 'Share your screen and let a friend take over — fully encrypted, no third-party apps.', color: '#7c3aed' },
    { icon: '👥', title: 'Group Calls', desc: 'Voice or video with multiple people at once. Hit the group call button in any chat.', color: '#2563eb' },
    { icon: '🌐', title: 'Spaces', desc: '@mentions, in-channel search, pinned messages, and inline message editing.', color: '#059669' },
    { icon: '🔴', title: 'Live', desc: 'Broadcast your camera or screen. Anyone on Phaze can watch.', color: '#dc2626' },
    { icon: '🎁', title: 'Invite Links', desc: 'Share your invite link and see who signs up from it.', color: '#d97706' },
    { icon: '📞', title: 'Calls', desc: 'Screen sharing mid-call, self-hosted TURN relay, better audio.', color: '#0891b2' },
    { icon: '🎨', title: 'Skype 7 theme', desc: 'Classic blue Skype skin is now the default. Dark and light themes still available.', color: '#a855f7' },
  ]
  const [sessionToken, setSessionToken] = useState<string | null>(() => localStorage.getItem(SESSION_KEY))
  const [theme, setTheme] = useState<ThemeId>(() =>
    // resolveTheme, not isThemeId: a browser that still remembers one of
    // the shelved Phaze themes gets moved to the default rather than being
    // left on a theme the picker no longer lists.
    resolveTheme(localStorage.getItem(THEME_KEY)))
  const [snow, setSnow] = useState<boolean>(() => localStorage.getItem(SNOW_KEY) === '1')
  // Period-accurate desktop window frame around the app. Off by default —
  // it costs screen space, so it's opt-in from the View menu.
  const [osFrame, setOsFrame] = useState<boolean>(() => localStorage.getItem(OSFRAME_KEY) === '1')
  const [myStatus, setMyStatus] = useState<UserStatus>(() => (localStorage.getItem(STATUS_KEY) as UserStatus) || 'Online')
  const [idle, setIdle] = useState(false)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  // Refs so the WS handler and audio paths see the live values without re-subscribing.
  const dndRef = useRef(false)
  const idleRef = useRef(false)
  const lastAckedStatusRef = useRef<UserStatus>('Online')
  const announcedStatusRef = useRef<UserStatus | null>(null)
  const [myMood, setMyMood] = useState('')
  const [moods, setMoods] = useState<Record<string, string>>({})
  const myDisplayNameRef = useRef('')
  const prevMoodRef = useRef('')
  const moodFetchedRef = useRef<Set<string>>(new Set())
  const shownStatus = effectiveStatus(myStatus, idle)
  const dnd = myStatus === 'Do Not Disturb'
  // Mirrored into a ref so the websocket handlers below can read the current
  // value without being re-created on every status change. Assigned in an
  // effect rather than during render — the consumers are all async callbacks,
  // so post-commit is soon enough, and writing refs mid-render is a lint error.
  useEffect(() => { dndRef.current = dnd }, [dnd])
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [emojiOpen, setEmojiOpen] = useState(false)
  const unreadRef = useRef<Record<string, number>>({})
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const draftInputRef = useRef<HTMLInputElement>(null)
  const restoreCheckedRef = useRef(false)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [globalSearchResults, setGlobalSearchResults] = useState<string[]>([])
  const globalSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [paletteIdx, setPaletteIdx] = useState(0)
  const [slashIdx, setSlashIdx] = useState(0)
  const [recording, setRecording] = useState(false)
  const [recDuration, setRecDuration] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recStartRef = useRef<number>(0)
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recChunksRef = useRef<Blob[]>([])
  const [settingsInitialTab, setSettingsInitialTab] = useState<'profile' | 'security' | 'devices' | 'privacy' | 'sessions' | 'danger' | 'notifications'>('profile')
  const [reportTarget, setReportTarget] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState('')
  const [reportSent, setReportSent] = useState(false)
  const [pinnedIds, setPinnedIds] = useState<string[]>([])
  const [pinsOpen, setPinsOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIdx, setMentionIdx] = useState(0)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [skypeHistory, setSkypeHistory] = useState<{ sender: string; body: string; sent_at: string }[]>([])
  const skypeHistoryCache = useRef<Record<string, { sender: string; body: string; sent_at: string }[]>>({})

  const [convos, setConvos] = useState<Convo[]>([])
  const [selectedConvo, setSelectedConvo] = useState<string | null>(null)
  const [turn, setTurn] = useState<TurnConfig | null>(null)
  const [convoLogs, setConvoLogs] = useState<Record<string, ConvoLine[]>>({})
  const [newGroupOpen, setNewGroupOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupMembers, setNewGroupMembers] = useState<string[]>([])
  const selectedConvoRef = useRef<string | null>(null)
  // Server-reported last-activity time per friend, from friend_status.ts.
  // Only consulted when there's no local chat history to sort by (fresh
  // browser/device) — real local history always wins.
  //
  // State rather than a ref because the Recent list reads it while rendering,
  // and reading a ref during render is both a lint error and genuinely
  // non-reactive — a fresh timestamp wouldn't reorder the list until some
  // unrelated render happened to come along. The one writer already calls
  // setFriends on the same message, so React batches the two together and
  // this costs no extra render.
  const [friendLastTs, setFriendLastTs] = useState<Record<string, number>>({})
  useLayoutEffect(() => { selectedConvoRef.current = selectedConvo }, [selectedConvo])

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme)
    document.documentElement.dataset.theme = theme
    // Sync theme preference to server when logged in.
    if (meRef.current) {
      sendRef.current({ type: 'settings_set', sender: meRef.current, body: JSON.stringify({ key: 'theme', value: theme }) })
    }
  }, [theme])

  /* When the user switches to an era that never shipped the currently-active
   * view (e.g. viewing Spaces then picking Skype 3), fall back to the DMs
   * home so they don't end up staring at an empty pane. */
  useEffect(() => {
    if (view === 'spaces' && !hasFeature(theme, 'spaces')) setView('dms')
    else if (view === 'live' && !hasFeature(theme, 'live_streams')) setView('dms')
  }, [theme, view])

  useEffect(() => {
    localStorage.setItem(SNOW_KEY, snow ? '1' : '0')
  }, [snow])

  useEffect(() => {
    localStorage.setItem(OSFRAME_KEY, osFrame ? '1' : '0')
  }, [osFrame])

  useEffect(() => {
    const el = chatScrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [log])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setPaletteOpen((v) => !v)
        setPaletteQuery('')
        setPaletteIdx(0)
        return
      }
      if (mod && e.key === '/') {
        e.preventDefault()
        draftInputRef.current?.focus()
        return
      }
      if (e.key === 'Escape') {
        if (paletteOpen) setPaletteOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen])

  const subscribersRef = useRef(new Set<(m: NexusMessage) => void>())
  const subscribe = useCallback((handler: (m: NexusMessage) => void) => {
    subscribersRef.current.add(handler)
    return () => { subscribersRef.current.delete(handler) }
  }, [])

  const wsRef = useRef<WebSocket | null>(null)
  const keysRef = useRef(loadOrCreateKeys())
  const peerKeysRef = useRef<Record<string, Uint8Array>>({})
  const pinsRef = useRef(loadPins())
  const meRef = useRef<string | null>(null)
  const selectedRef = useRef<string | null>(null)
  const sendRef = useRef<(m: NexusMessage) => void>(() => {})
  const callStateRef = useRef<CallState | null>(null)
  const typingTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const outTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ringingAudioRef = useRef<HTMLAudioElement | null>(null)
  const ingestDMHistoryRef = useRef<(peer: string, rows: import('./nexusTypes').DMMessage[]) => void>(() => {})

  useEffect(() => {
    meRef.current = me
    if (me) {
      const u = loadUnread(me)
      unreadRef.current = u
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUnread(u)
    } else {
      unreadRef.current = {}
      setUnread({})
    }
  }, [me])
  useEffect(() => { selectedRef.current = selected }, [selected])
  useEffect(() => {
    if (!selected || !me) { setSkypeHistory([]); return }
    if (skypeHistoryCache.current[selected]) { setSkypeHistory(skypeHistoryCache.current[selected]); return }
    fetch(`/api/v1/import/skype/messages?contact=${encodeURIComponent(selected)}`, {
      credentials: 'include',
    }).then(r => r.ok ? r.json() : []).then((msgs: { sender: string; body: string; sent_at: string }[]) => {
      skypeHistoryCache.current[selected] = msgs ?? []
      setSkypeHistory(msgs ?? [])
    }).catch(() => setSkypeHistory([]))
  }, [selected, me])
  useEffect(() => { callStateRef.current = callState }, [callState])

  const appendLog = useCallback((from: string, text: string, isMe: boolean, opts?: { id?: string; file?: FileAttachment; peer?: string; ts?: number; callInfo?: ChatLine['callInfo'] }) => {
    const id = opts?.id || newMsgId()
    const ts = opts?.ts ?? Date.now()
    const file = opts?.file || decodeFileBody(text) || undefined
    const line: ChatLine = { id, from, text: file ? '' : text, me: isMe, ts, file, callInfo: opts?.callInfo }
    const my = meRef.current
    const peer = opts?.peer ?? (isMe ? selectedRef.current : from)
    if (my && peer) {
      const existing = loadHistory(my, peer)
      saveHistory(my, peer, [...existing, line])
    }
    if (peer && peer === selectedRef.current) {
      setLog((prev) => [...prev, line])
    }
    if (!isMe && my && peer && peer !== selectedRef.current) {
      const bump = containsMention(line.text, my) ? 2 : 1
      const next = { ...unreadRef.current, [peer]: (unreadRef.current[peer] || 0) + bump }
      unreadRef.current = next
      setUnread(next)
      saveUnread(my, next)
    }
  }, [])

  const mutateMessage = useCallback((peer: string, msgId: string, fn: (l: ChatLine) => ChatLine) => {
    const my = meRef.current
    if (!my) return
    const stored = loadHistory(my, peer)
    let changed = false
    const updated = stored.map((l) => {
      if (l.id !== msgId) return l
      changed = true
      return fn(l)
    })
    if (!changed) return
    saveHistory(my, peer, updated)
    if (selectedRef.current === peer) {
      setLog((prev) => prev.map((l) => (l.id === msgId ? fn(l) : l)))
    }
  }, [])

  const acceptPeerKey = useCallback((peer: string, pk: Uint8Array, fpHint: string) => {
    void (async () => {
      const fp = await fingerprint(pk)
      if (fpHint && fpHint !== fp) {
        setErr(`Key fingerprint mismatch for ${peer}`)
        return
      }
      const prev = pinsRef.current[peer]
      if (prev && prev.fingerprint !== fp) {
        setErr(`Possible MITM: ${peer} key changed (pinned ${prev.fingerprint}, now ${fp})`)
        return
      }
      if (!prev) {
        pinsRef.current[peer] = { fingerprint: fp, publicKeyB64: encodePublicKeyB64(pk) }
        savePins(pinsRef.current)
      }
      const hadKey = !!peerKeysRef.current[peer]
      peerKeysRef.current[peer] = pk
      if (peer === selectedRef.current) {
        setE2eReady(true)
        // If we just learned this peer's key, re-pull server history so we
        // can decrypt rows that came in before the handshake.
        if (!hadKey && meRef.current) {
          sendRef.current({ type: 'dm_history', sender: meRef.current, recipient: peer })
        }
      }
    })()
  }, [])

  const unwrap = useCallback((msg: NexusMessage): NexusMessage => {
    const sender = msg.sender ?? ''
    if (!sender) return msg
    const pk = peerKeysRef.current[sender]
    const sk = keysRef.current.secretKey
    const out = { ...msg }
    // Only decrypt body for chat messages — call signaling is not encrypted.
    // Never let raw ciphertext reach the UI: no peer key yet, or a bad
    // decrypt, both fall back to a placeholder instead of the E2EE: blob.
    if (out.body && msg.type === 'msg') {
      if (pk) {
        try { out.body = decryptFromPeer(out.body, pk, sk) } catch { out.body = '[Encrypted]' }
      } else {
        out.body = '[Encrypted]'
      }
    }
    return out
  }, [])

  const stopRinger = useCallback(() => {
    if (ringingAudioRef.current) {
      ringingAudioRef.current.pause()
      ringingAudioRef.current.currentTime = 0
      ringingAudioRef.current = null
    }
  }, [])

  const startRinger = useCallback((filename: string) => {
    stopRinger()
    if (dndRef.current) return // Do Not Disturb: calls still show, they just don't ring out loud
    try {
      const a = new Audio(phazeSoundUrl(filename))
      a.loop = true
      a.volume = 0.8
      ringingAudioRef.current = a
      void a.play().catch(() => {})
    } catch { /* ignore */ }
  }, [stopRinger])

  const tearDownCall = useCallback(() => {
    stopRinger()
    if (callStateRef.current) playPhazeSound('CallEnd.wav')
    if (ringTimerRef.current) { clearTimeout(ringTimerRef.current); ringTimerRef.current = null }
    if (callTimerRef.current) { clearInterval(callTimerRef.current); callTimerRef.current = null }
    setCallSeconds(0)
    setJitsiRoom(null)
    setCallState(null)
  }, [stopRinger])

  const hangUp = useCallback(() => {
    const cs = callStateRef.current
    if (cs) {
      const type = cs.status === 'ringing' ? 'call_reject' : 'call_end'
      sendRef.current({ type, recipient: cs.peer })
    }
    tearDownCall()
  }, [tearDownCall])


  const startCall = useCallback((type: 'audio' | 'video') => {
    const recipient = selectedRef.current
    if (!recipient || !meRef.current) return
    sendRef.current({ type: 'call_offer', recipient, body: type })
    setCallState({ peer: recipient, type, status: 'ringing', direction: 'outgoing' })
    startRinger('CallOutgoing.wav')
    ringTimerRef.current = setTimeout(() => {
      if (callStateRef.current?.status === 'ringing') {
        hangUp()
        setErr('No answer')
      }
    }, 60000)
  }, [hangUp, startRinger])

  const acceptCall = useCallback(() => {
    const cs = callStateRef.current
    if (!cs) return
    stopRinger()
    sendRef.current({ type: 'call_answer', recipient: cs.peer, body: cs.type })
  }, [stopRinger])

  const onMessageRef = useRef<(raw: NexusMessage) => void>(() => {})

  useLayoutEffect(() => {
    sendRef.current = (m: NexusMessage) => {
      const w = wsRef.current
      if (!w || w.readyState !== WebSocket.OPEN) {
        setErr('Not connected')
        return
      }
      w.send(JSON.stringify(m))
    }
  })

  useLayoutEffect(() => {
    onMessageRef.current = (raw: NexusMessage) => {
      const msg = unwrap(raw)

      switch (msg.type) {
        case 'auth_result':
          if (msg.status === 'ok' && (msg.qr_token || msg.sender)) {
            if (msg.qr_token) {
              localStorage.setItem(SESSION_KEY, msg.qr_token)
              setSessionToken(msg.qr_token)
            }
            const wasLoggedIn = !!meRef.current
            setMe(msg.sender ?? null)
            setErr('')
            if (msg.turn_config) setTurn(msg.turn_config)
            if (!wasLoggedIn) playPhazeSound('Login.wav')
            sendRef.current({
              type: 'presence',
              sender: msg.sender,
              status: (localStorage.getItem(STATUS_KEY) as UserStatus) || 'Online',
              public_key: encodePublicKeyB64(keysRef.current.publicKey),
            })
            registerPush(sendRef.current)
            // Load server-side settings to sync preferences across devices.
            sendRef.current({ type: 'settings_get', sender: msg.sender })
            // On first login of this browser session, ask the server whether
            // this account has a PIN-encrypted key backup waiting. If yes
            // (and we don't already have the same keys), we'll prompt the
            // user to restore.
            if (!restoreCheckedRef.current) {
              restoreCheckedRef.current = true
              sendRef.current({ type: 'key_backup_get' })
            }
          } else {
            localStorage.removeItem(SESSION_KEY)
            if (msg.status === 'totp_required') { setNeedsTotp(true); setErr('Enter your 2FA code or a backup code.') }
            else setErr(msg.error || msg.status || 'Auth failed')
          }
          break

        case 'status_result':
          if (msg.error) {
            setErr(msg.error)
            setMyStatus(lastAckedStatusRef.current)
          } else if (msg.status) {
            lastAckedStatusRef.current = msg.status as UserStatus
          }
          break

        case 'profile_update':
          if (msg.sender) {
            setMoods((m) => ({ ...m, [msg.sender!]: msg.mood || '' }))
            if (msg.sender === meRef.current) {
              // Another device of ours changed it; mirror locally.
              setMyMood(msg.mood || '')
              myDisplayNameRef.current = msg.display_name || myDisplayNameRef.current
            }
          }
          break

        case 'update_result':
          if (msg.error) {
            setErr(msg.error)
            setMyMood(prevMoodRef.current)
          }
          break

        case 'friend_status':
          if (msg.sender) {
            setFriends((f) => ({ ...f, [msg.sender!]: msg.status || 'Offline' }))
            if (msg.ts) {
              const sender = msg.sender
              const ts = msg.ts
              setFriendLastTs((m) => (m[sender] === ts ? m : { ...m, [sender]: ts }))
            }
            if (msg.status === 'Offline' && callStateRef.current?.peer === msg.sender) {
              tearDownCall()
            }
          }
          break

        case 'call_log': {
          const my = meRef.current
          if (my && msg.sender && msg.recipient) {
            const peer = msg.sender === my ? msg.recipient : msg.sender
            appendLog(peer, '', false, {
              id: newMsgId(),
              peer,
              ts: msg.ts ?? Date.now(),
              callInfo: { kind: msg.body || 'audio', status: msg.status === 'answered' ? 'answered' : 'missed', duration: msg.duration ?? 0 },
            })
          }
          break
        }

        case 'pending_requests':
          setPending(msg.results ?? [])
          break

        case 'friend_request':
          if (msg.sender) setPending((p) => (p.includes(msg.sender!) ? p : [...p, msg.sender!]))
          break

        case 'friend_request_sent':
          setErr(`Friend request sent to ${msg.recipient || 'user'}`)
          break

        case 'friend_error':
          setErr(msg.error || 'Friend request failed')
          break

        case 'friend_accepted':
          if (msg.sender) {
            setFriends((f) => ({ ...f, [msg.sender!]: msg.status || 'Online' }))
            appendLog('system', `${msg.sender} accepted your friend request`, false)
          }
          break

        case 'friend_removed':
          if (msg.sender) {
            setFriends((f) => { const n = { ...f }; delete n[msg.sender!]; return n })
          }
          break

        case 'register_result':
          if (msg.status === 'ok') {
            // Anonymous registration — no email, no verify step. Sign in straight away.
            setErr('Account created. Sign in below.')
            setRegStep('done')
            setMode('login')
            setLoginUser(regUser)
          } else if (msg.status === 'pending_verification' || msg.status === 'verification_sent') {
            setErr('Account created. Check your email for a 6-digit code, enter it below.')
            setRegStep('verify')
          } else if (msg.status === 'code_resent') {
            setErr('Verification code resent. Check your email.')
          } else {
            setErr(msg.error || 'Registration failed')
          }
          break

        case 'verify_result':
          if (msg.status === 'ok') {
            setErr('Email verified. You can sign in now.')
            setRegStep('done')
            setMode('login')
          } else {
            setErr(msg.error || 'Verification failed — double-check the code')
          }
          break

        case 'search_results':
          setGlobalSearchResults(msg.results ?? [])
          break
        case 'presence': {
          const pk = decodePublicKeyField(msg.public_key as string | number[] | undefined)
          if (msg.sender && pk && pk.length === 32) acceptPeerKey(msg.sender, pk, msg.key_fingerprint || '')
          if (msg.sender && msg.status) setFriends((f) => ({ ...f, [msg.sender!]: msg.status || 'Online' }))
          break
        }

        case 'key_request':
          if (msg.sender) {
            const my = meRef.current
            if (my) {
              void fingerprint(keysRef.current.publicKey).then((fp) => {
                sendRef.current({
                  type: 'presence',
                  sender: my,
                  recipient: msg.sender,
                  // Report the real status — a key reply claiming "Online"
                  // used to walk back Away/DND on the peer's screen.
                  status: announcedStatusRef.current ?? 'Online',
                  public_key: encodePublicKeyB64(keysRef.current.publicKey),
                  key_fingerprint: fp,
                })
              })
            }
          }
          break

        case 'msg':
          if (msg.sender && msg.body !== undefined) {
            const my = meRef.current
            const incomingId = msg.msg_id
            // Suppress duplicate when the server echoes a message we already
            // wrote optimistically (sender === me path).
            if (incomingId && msg.sender === my) {
              const peer = selectedRef.current
              if (peer && loadHistory(my!, peer).some((l) => l.id === incomingId)) break
            }
            appendLog(msg.sender, msg.body || '[empty]', msg.sender === my, { id: incomingId })
            // Suppress notification sound + browser notification for muted
            // peers, and for everyone while we're on Do Not Disturb.
            const senderIsMuted = msg.sender ? isPeerMuted(msg.sender) : false
            if (msg.sender !== my && !senderIsMuted && !dndRef.current) {
              playPhazeSound('MessageReceived.wav')
              if (document.hidden) {
                const preview = (msg.body || '').startsWith('phaze-file')
                  ? '📎 Attachment' : (msg.body || '').slice(0, 60)
                if (wails) {
                  wails.Notify(msg.sender, preview)
                } else if (Notification.permission === 'granted') {
                  new Notification(msg.sender!, { body: preview, icon: '/web/favicon.svg', tag: `dm-${msg.sender}` })
                }
              }
            }
          }
          break

        case 'dm_history':
          if (msg.recipient && msg.dm_history) {
            ingestDMHistoryRef.current(msg.recipient, msg.dm_history)
          }
          break

        case 'convo_info':
          if (msg.convo_id) {
            setConvos((prev) => {
              if (prev.some((c) => c.id === msg.convo_id)) return prev
              return [...prev, { id: msg.convo_id!, name: msg.convo_name || msg.convo_id!, members: msg.members || [], creator: msg.creator || '' }]
            })
            sendRef.current({ type: 'convo_history', convo_id: msg.convo_id })
          }
          break

        case 'convo_created':
          if (msg.convo_id) {
            setConvos((prev) => {
              if (prev.some((c) => c.id === msg.convo_id)) return prev
              return [...prev, { id: msg.convo_id!, name: msg.convo_name || msg.convo_id!, members: msg.members || [], creator: msg.creator || '' }]
            })
            sendRef.current({ type: 'convo_history', convo_id: msg.convo_id })
            setSelectedConvo(msg.convo_id!)
            setSelected(null)
          }
          break

        case 'convo_msg':
          if (msg.convo_id && msg.sender && msg.body !== undefined) {
            const gline: ConvoLine = {
              id: `${msg.convo_id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              sender: msg.sender,
              body: msg.body,
              ts: Date.now(),
              me: msg.sender === meRef.current,
            }
            setConvoLogs((prev) => ({
              ...prev,
              [msg.convo_id!]: [...(prev[msg.convo_id!] ?? []), gline],
            }))
            if (msg.sender !== meRef.current && selectedConvoRef.current !== msg.convo_id && !dndRef.current) {
              playPhazeSound('MessageReceived.wav')
            }
          }
          break

        case 'convo_history':
          if (msg.convo_id && msg.dm_history) {
            const hlines: ConvoLine[] = msg.dm_history.map((h, i) => ({
              id: `${msg.convo_id}-h-${i}`,
              sender: h.sender,
              body: h.body,
              ts: h.created_at ? new Date(h.created_at).getTime() : Date.now() - (msg.dm_history!.length - i) * 1000,
              me: h.sender === meRef.current,
            }))
            setConvoLogs((prev) => ({ ...prev, [msg.convo_id!]: hlines }))
          }
          break

        case 'convo_left':
          if (msg.convo_id && msg.sender) {
            setConvos((prev) => prev.map((c) =>
              c.id === msg.convo_id
                ? { ...c, members: c.members.filter((m) => m !== msg.sender) }
                : c
            ))
          }
          break

        // Sent whenever a group's membership or name changes — after
        // convo_add_member, convo_remove_member, or convo_rename. Has to be
        // an upsert rather than an update-only: someone just added to a
        // group while already online receives this as the very first thing
        // that tells their client the group exists at all, with no prior
        // convo_info to have created a row for it.
        case 'convo_updated':
          if (msg.convo_id) {
            setConvos((prev) => {
              const name = msg.convo_name || msg.convo_id!
              const members = msg.members || []
              const creator = msg.creator || ''
              if (!prev.some((c) => c.id === msg.convo_id)) {
                return [...prev, { id: msg.convo_id!, name, members, creator }]
              }
              return prev.map((c) => (c.id === msg.convo_id ? { ...c, name, members, creator: creator || c.creator } : c))
            })
          }
          break

        // The creator removed this connection's own user from a group.
        // Distinct from convo_left (which is what OTHER members see when
        // someone leaves or is removed) because by the time that broadcast
        // goes out the removed user is no longer in the member list it's
        // addressed to — this is the only message that can still reach them.
        case 'convo_removed':
          if (msg.convo_id) {
            setConvos((prev) => prev.filter((c) => c.id !== msg.convo_id))
            setConvoLogs((prev) => {
              const { [msg.convo_id!]: _drop, ...rest } = prev
              return rest
            })
            if (selectedConvoRef.current === msg.convo_id) {
              setSelectedConvo(null)
            }
          }
          break

        // convo_create already had a failure path with nowhere for it to
        // go — dropped silently by having no case at all. Now that
        // add/remove/rename can fail for reasons a person actually needs to
        // see (not a member, not the creator, no eligible members), reusing
        // the existing notice popup rather than adding a second one.
        case 'convo_error':
          if (msg.error) setGlobalNotice({ from: 'Groups', msg: msg.error })
          break

        case 'link_check':
          if (msg.status === 'approved' && msg.qr_token) {
            // Server returned a fresh session token for the linked device.
            localStorage.setItem(SESSION_KEY, msg.qr_token)
            setSessionToken(msg.qr_token)
            setLinkBusy(false)
            setErr('')
            sendRef.current({ type: 'session_auth', qr_token: msg.qr_token, device_info: `web/${window.location.hostname}` })
          }
          break

        case 'key_backup_result':
          if (msg.status === 'ok' && msg.key_backup) {
            // Silently keep the backup available but don't auto-prompt restore.
            // Users can restore from Settings → Backup & Devices if needed.
          } else if (msg.status === 'stored') {
            setErr('✓ Recovery PIN saved')
          } else if (msg.status === 'deleted') {
            setErr('Recovery backup removed')
          } else if (msg.error && msg.error !== 'no backup found' && msg.error !== 'not found') {
            setErr(`Backup error: ${msg.error}`)
          }
          break

        case 'msg_edit':
          if (msg.sender && msg.msg_id && msg.body !== undefined) {
            mutateMessage(msg.sender, msg.msg_id, (l) => ({ ...l, text: msg.body || '', edited: true, deleted: false }))
          }
          break

        case 'msg_status':
          if (msg.error) setErr(msg.error)
          break

        case 'msg_edit_result':
          if (msg.error) setErr(msg.error)
          break

        case 'msg_delete':
          if (msg.sender && msg.msg_id) {
            mutateMessage(msg.sender, msg.msg_id, (l) => ({ ...l, text: '', deleted: true, file: undefined }))
          }
          break

        case 'msg_react':
          if (msg.sender && msg.msg_id && msg.reaction) {
            const reactor = msg.sender
            const emoji = msg.reaction
            mutateMessage(msg.sender, msg.msg_id, (l) => {
              const r = { ...(l.reactions || {}) }
              const users = new Set(r[emoji] || [])
              if (users.has(reactor)) users.delete(reactor)
              else users.add(reactor)
              if (users.size === 0) delete r[emoji]
              else r[emoji] = [...users]
              return { ...l, reactions: r }
            })
          }
          break

        case 'read_receipt':
          // Mark our sent messages as seen — only update the live view if the receipt is from the open chat
          if (msg.sender && msg.sender !== meRef.current) {
            const peer = msg.sender
            if (peer === selectedRef.current) {
              setLog((prev) => prev.map((l) => l.me && !l.seen ? { ...l, seen: true } : l))
            }
            const my = meRef.current
            if (my && peer) {
              const stored = loadHistory(my, peer)
              if (stored.some((l) => l.me && !l.seen)) {
                saveHistory(my, peer, stored.map((l) => l.me && !l.seen ? { ...l, seen: true } : l))
              }
            }
          }
          break

        case 'typing':
          if (msg.sender && msg.sender !== meRef.current) {
            const peer = msg.sender
            setTypingPeers((p) => new Set([...p, peer]))
            clearTimeout(typingTimersRef.current[peer])
            typingTimersRef.current[peer] = setTimeout(() => {
              setTypingPeers((p) => { const n = new Set(p); n.delete(peer); return n })
            }, 3000)
          }
          break

        case 'call_offer':
          if (msg.sender) {
            setCallState({ peer: msg.sender, type: (msg.body as 'audio' | 'video') || 'audio', status: 'ringing', direction: 'incoming' })
            startRinger('CallIncoming.wav')
            if (Notification.permission === 'granted') {
              new Notification(`Incoming call from ${msg.sender}`, {
                body: 'Open Phaze to answer',
                icon: '/web/favicon.svg',
                tag: 'phaze-call',
              })
            }
          }
          break

        case 'call_jitsi':
          if (msg.room_id) {
            stopRinger()
            if (ringTimerRef.current) { clearTimeout(ringTimerRef.current); ringTimerRef.current = null }
            setJitsiRoom(msg.room_id)
            setCallState((prev) => prev ? { ...prev, status: 'active' } : null)
            setCallSeconds(0)
            if (callTimerRef.current) clearInterval(callTimerRef.current)
            callTimerRef.current = setInterval(() => setCallSeconds((s) => s + 1), 1000)
          }
          break

        case 'call_reject':
        case 'call_end':
          tearDownCall()
          break

        case 'call_busy':
          tearDownCall()
          setErr(`${msg.sender || 'User'} is already in a call.`)
          break

        case 'call_error':
          tearDownCall()
          setErr(msg.error || msg.body || 'Call failed — user may be offline.')
          break

        case 'call_invite':
          if (msg.sender && msg.channel_id) {
            setGroupCallInvite({ from: msg.sender, room: msg.channel_id })
          }
          break

        case 'global_notice':
          if (msg.body) {
            setGlobalNotice({ from: msg.sender || 'Phaze', msg: msg.body })
          }
          break

        case 'device_challenge':
          // Someone signed in from a device this account hasn't approved.
          // Their session is held; we get to approve or deny it.
          if (msg.challenge_id) {
            setDeviceAsk({
              id: msg.challenge_id,
              label: msg.body || 'an unrecognised device',
              ip: msg.status || '',
              ts: msg.ts || Date.now(),
            })
          }
          break

        case 'device_result':
          // Resolved — possibly from one of our other sessions, so clear the
          // prompt regardless of which tab answered it.
          if (msg.error) { setErr(msg.error); break }
          setDeviceAsk((cur) => (cur && msg.challenge_id && cur.id !== msg.challenge_id ? cur : null))
          if (msg.status === 'approved') setGlobalNotice({ from: 'Phaze', msg: `Approved sign-in from ${msg.body || 'a new device'}.` })
          if (msg.status === 'denied') setGlobalNotice({ from: 'Phaze', msg: `Blocked sign-in from ${msg.body || 'a new device'}.` })
          break

        case 'kicked':
          localStorage.removeItem(SESSION_KEY)
          peerKeysRef.current = {}
          setFriends({})
          setPending([])
          setSelected(null)
          setLog([])
          setMe(null)
          setErr(msg.body || 'Signed in from another location.')
          break

        case 'delete_account_result':
          if (msg.status === 'ok') {
            localStorage.removeItem(SESSION_KEY)
            localStorage.removeItem(KEYS_KEY)
            peerKeysRef.current = {}
            pinsRef.current = {}
            try {
              localStorage.removeItem('phaze_key_pins_v1')
              const my = meRef.current
              if (my) {
                localStorage.removeItem(unreadKey(my))
                for (let i = localStorage.length - 1; i >= 0; i--) {
                  const k = localStorage.key(i)
                  if (k && k.startsWith(`phaze_chat_${my}_`)) localStorage.removeItem(k)
                }
              }
            } catch { /* fine */ }
            setMe(null)
            setFriends({})
            setPending([])
            setSelected(null)
            setLog([])
            setErr('Account deleted. All your data has been erased.')
          } else {
            setErr(msg.error || 'Delete failed')
          }
          break

        case 'block_result':
          if (msg.status === 'blocked' && msg.recipient) {
            const blocked = msg.recipient
            setFriends((f) => { const n = { ...f }; delete n[blocked]; return n })
            if (selectedRef.current === blocked) { setSelected(null); setLog([]) }
          }
          break

        case 'report_result':
          setReportSent(true)
          break

        case 'settings_result':
          if (msg.status === 'ok' && msg.envelopes) {
            // A theme synced down from another device may predate the
            // shelving, so resolve it the same way a stored one is.
            const t = msg.envelopes['theme']
            if (isThemeId(t)) setTheme(resolveTheme(t))
          }
          break

        case 'purge_email_result':
          if (msg.status === 'ok') setErr('Email removed from your account.')
          else setErr(msg.error || 'Failed to purge email')
          break

        default:
          if (import.meta.env.DEV) console.warn('[nexus] unknown message type:', msg.type)
          break
      }

      subscribersRef.current.forEach((sub) => {
        try { sub(msg) } catch { /* swallow */ }
      })
    }
  }, [unwrap, appendLog, acceptPeerKey, tearDownCall])

  useEffect(() => {
    const w = new WebSocket(wsUrl)
    wsRef.current = w
    startTransition(() => {
      setConn('connecting')
      setErr('')
    })

    w.onopen = () => {
      setConn('open')
      wsRetryDelay.current = 1000
      // Cookie pre-auth: the browser sends phaze_session automatically with
      // the WS upgrade request. The server authenticates from the cookie and
      // immediately sends auth_result — no token needed in JS memory.
      // Legacy localStorage token kept as fallback for existing open tabs.
      const tok = localStorage.getItem(SESSION_KEY)
      if (tok) {
        // Migrate: use the stored token once, then remove it so future
        // sessions rely solely on the HttpOnly cookie.
        sendRef.current({ type: 'session_auth', qr_token: tok, device_info: `web/${window.location.hostname}` })
        localStorage.removeItem(SESSION_KEY)
      }
    }

    w.onmessage = (e: MessageEvent) => {
      try {
        onMessageRef.current(JSON.parse(e.data as string) as NexusMessage)
      } catch { /* malformed */ }
    }

    w.onclose = () => {
      setConn('off')
      wsRef.current = null
      const delay = Math.min(wsRetryDelay.current, 30000)
      wsRetryDelay.current = Math.min(delay * 2, 30000)
      setTimeout(() => setWsRetry((n) => n + 1), delay)
    }

    w.onerror = () => {}

    return () => {
      // Detach handlers before closing: a cleanup-initiated close must not
      // schedule another retry, or every deliberate reconnect (e.g. the
      // post-login cookie refresh) locks the client into closing a healthy
      // socket once a second forever.
      w.onclose = null
      w.onmessage = null
      w.onerror = null
      w.close()
      wsRef.current = null
    }
  }, [wsUrl, wsRetry])

  const send = useCallback((m: NexusMessage) => { sendRef.current(m) }, [])

  const pickStatus = useCallback((s: UserStatus) => {
    setMyStatus(s)
    localStorage.setItem(STATUS_KEY, s)
  }, [])

  const saveMood = useCallback((mood: string) => {
    prevMoodRef.current = myMood
    setMyMood(mood)
    send({ type: 'update_profile', sender: meRef.current ?? undefined, mood, display_name: myDisplayNameRef.current })
  }, [myMood, send])

  // Seed our own mood + display name once we know who we are.
  useEffect(() => {
    if (!me) return
    fetch(`/api/v1/profile/${me}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (!p) return
        setMyMood(p.mood || '')
        myDisplayNameRef.current = p.display_name || ''
      })
      .catch(() => {})
  }, [me])

  // Lazily pick up a peer's mood the first time we open their chat.
  useEffect(() => {
    if (!selected || moodFetchedRef.current.has(selected)) return
    moodFetchedRef.current.add(selected)
    fetch(`/api/v1/profile/${selected}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => { if (p) setMoods((m) => ({ ...m, [selected]: p.mood || '' })) })
      .catch(() => {})
  }, [selected])

  // Auto-away: ten quiet minutes downgrade Online to Away; any activity undoes it.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const arm = () => {
      clearTimeout(t)
      if (idleRef.current) { idleRef.current = false; setIdle(false) }
      t = setTimeout(() => { idleRef.current = true; setIdle(true) }, IDLE_MS)
    }
    arm()
    window.addEventListener('mousemove', arm)
    window.addEventListener('keydown', arm)
    document.addEventListener('visibilitychange', arm)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousemove', arm)
      window.removeEventListener('keydown', arm)
      document.removeEventListener('visibilitychange', arm)
    }
  }, [])

  // Tell the server whenever the effective status changes (login, manual pick,
  // idle in/out). The ref stops repeat sends of the same value.
  useEffect(() => {
    if (!me) { announcedStatusRef.current = null; return }
    if (announcedStatusRef.current === shownStatus) return
    announcedStatusRef.current = shownStatus
    send({ type: 'status_update', body: shownStatus })
  }, [me, shownStatus, send])

  const doAuth = async (username: string, password: string, totp: string) => {
    if (!username) { setErr('Username is required.'); return }
    if (!password) { setErr('Password is required.'); return }
    setErr('')
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password, totp_code: totp || undefined, device_info: `web/${window.location.hostname}` }),
      })
      if (res.status === 401) {
        const data = await res.json().catch(() => ({})) as { status?: string; error?: string }
        if (data.status === 'totp_required') { setNeedsTotp(true); setErr('Enter your 2FA code or a backup code.'); return }
        setErr('Invalid username or password')
        return
      }
      if (!res.ok) {
        const text = await res.text()
        setErr(text || 'Login failed')
        return
      }
      const data = await res.json().catch(() => ({})) as {
        status?: string; device_label?: string; code_sent?: boolean
      }
      if (data.status === 'device_verification_required') {
        // The session cookie is set but inert until this is approved, so
        // don't reconnect yet — there's nothing to authenticate with.
        setDeviceVerify({ label: data.device_label || 'this device', codeSent: !!data.code_sent })
        setDeviceCode('')
        setErr('')
        return
      }
      // Cookie is set by the server (HttpOnly — never accessible to JS).
      // Reconnect the WS so the server can pre-auth from the cookie.
      setWsRetry((n) => n + 1)
    } catch {
      setErr('Network error — please try again')
    }
  }

  // Completes a sign-in that's waiting on new-device approval. The session
  // cookie is already set but inert; this is what lifts the hold.
  const submitDeviceCode = async (code: string) => {
    if (!code.trim()) return
    try {
      const res = await fetch('/api/v1/auth/verify-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: code.trim() }),
      })
      const data = await res.json().catch(() => ({})) as { status?: string; error?: string }
      if (!res.ok || data.status !== 'ok') {
        setErr(data.error || 'That code was not accepted')
        return
      }
      setDeviceVerify(null)
      setDeviceCode('')
      setErr('')
      // Now that the hold is lifted the cookie authenticates, so reconnect.
      setWsRetry((n) => n + 1)
    } catch {
      setErr('Network error — please try again')
    }
  }

  const sendFriendRequest = (to: string) => {
    send({ type: 'friend_request', sender: me ?? undefined, recipient: to })
  }

  const acceptFriend = (from: string) => {
    send({ type: 'friend_accept', recipient: from })
    setPending((p) => p.filter((x) => x !== from))
  }

  const ingestDMHistory = useCallback((peer: string, rows: import('./nexusTypes').DMMessage[]) => {
    const my = meRef.current
    if (!my || !peer || !rows?.length) return
    const peerKey = peerKeysRef.current[peer]
    const mySec = keysRef.current.secretKey
    const local = loadHistory(my, peer)
    const byId = new Map<string, ChatLine>(local.map((l) => [l.id, l]))
    for (const r of rows) {
      const isMe = r.sender === my
      let text = r.body || ''
      // For E2EE bodies we only know how to decrypt if we have the peer key.
      // If the peer key isn't loaded yet, leave as-is; the next presence
      // exchange will provide it and a later refresh will resolve.
      if (text && peerKey) {
        try { text = decryptFromPeer(text, peerKey, mySec) } catch { text = '[Encrypted]' }
      }
      const file = decodeFileBody(text) || undefined
      const ts = Date.parse(r.created_at + 'Z') || Date.now()
      const existing = byId.get(r.msg_id)
      const line: ChatLine = {
        id: r.msg_id,
        from: r.sender,
        text: file ? '' : (r.deleted ? '' : text),
        me: isMe,
        ts: existing?.ts ?? ts,
        edited: r.edited || existing?.edited,
        deleted: r.deleted || existing?.deleted,
        reactions: r.reactions || existing?.reactions,
        file: file || existing?.file,
      }
      byId.set(r.msg_id, line)
    }
    const merged = Array.from(byId.values()).sort((a, b) => a.ts - b.ts)
    saveHistory(my, peer, merged)
    if (selectedRef.current === peer) {
      setLog(merged)
    }
  }, [])
  useEffect(() => { ingestDMHistoryRef.current = ingestDMHistory }, [ingestDMHistory])

  // Unlock browser audio on first user interaction so ringtones work without gesture.
  useEffect(() => {
    const unlock = () => {
      const a = new Audio(phazeSoundUrl('Beep.wav'))
      a.volume = 0
      void a.play().catch(() => {})
      document.removeEventListener('click', unlock, true)
      document.removeEventListener('keydown', unlock, true)
    }
    document.addEventListener('click', unlock, true)
    document.addEventListener('keydown', unlock, true)
    return () => {
      document.removeEventListener('click', unlock, true)
      document.removeEventListener('keydown', unlock, true)
    }
  }, [])

  const openChat = (name: string) => {
    setSelected(name)
    setEditingId(null)
    setDraft('')
    setSearch('')
    setSearchOpen(false)
    setMentionQuery(null)
    setPinsOpen(false)
    if (me) {
      setLog(loadHistory(me, name))
      setPinnedIds(loadPinned(me, name))
      if (unreadRef.current[name]) {
        const next = { ...unreadRef.current, [name]: 0 }
        unreadRef.current = next
        setUnread(next)
        saveUnread(me, next)
      }
      // Pull durable history from the server so messages survive a localStorage
      // wipe, a new browser, or a fresh device. Server stores E2EE ciphertext.
      send({ type: 'dm_history', sender: me, recipient: name })
      // Notify peer we've read their messages
      send({ type: 'read_receipt', sender: me, recipient: name, body: name })
    } else {
      setLog([])
      setPinnedIds([])
    }
    setE2eReady(!!peerKeysRef.current[name])
    if (!peerKeysRef.current[name]) {
      send({ type: 'key_request', sender: me ?? undefined, recipient: name })
    }
  }

  const togglePin = useCallback((line: ChatLine) => {
    if (!selected || !me) return
    setPinnedIds((prev) => {
      const next = prev.includes(line.id) ? prev.filter((x) => x !== line.id) : [...prev, line.id]
      savePinned(me, selected, next)
      return next
    })
  }, [selected, me])

  const scrollToMessage = useCallback((id: string) => {
    const el = document.querySelector(`[data-msg-id="${id}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('highlight-flash')
      setTimeout(() => el.classList.remove('highlight-flash'), 1600)
    }
  }, [])

  const sendChat = () => {
    if (!selected || !me || !draft.trim()) return
    if (editingId) {
      submitEdit()
      return
    }
    let plaintext = draft.trim()

    // Slash commands run client-side. "Local" actions (e.g. /clear, /help)
    // don't produce an outgoing message — they manipulate the UI directly.
    if (plaintext.startsWith('/')) {
      const space = plaintext.indexOf(' ')
      const head = space === -1 ? plaintext : plaintext.slice(0, space)
      const tail = space === -1 ? '' : plaintext.slice(space + 1)
      const cmd = SLASH_COMMANDS.find((c) => c.cmd === head)
      if (cmd) {
        const out = cmd.run(tail)
        setDraft('')
        if (typeof out === 'string') {
          if (!out) return
          plaintext = out
        } else if (out.local === 'clear') {
          setLog([])
          return
        } else if (out.local === 'help') {
          const helpLines = SLASH_COMMANDS.map((c) => `${c.cmd} — ${c.desc}`).join('\n')
          appendLog('system', `Available commands:\n${helpLines}`, false, { id: newMsgId() })
          return
        }
      }
    }

    const peer = peerKeysRef.current[selected]
    const body = peer ? encryptForPeer(plaintext, peer, keysRef.current.secretKey) : plaintext
    const msgId = newMsgId()
    send({ type: 'msg', sender: me, recipient: selected, body, msg_id: msgId })
    appendLog(me, plaintext, true, { id: msgId })
    playPhazeSound('MessageOutgoing.wav')
    setDraft('')
    setEmojiOpen(false)
  }

  const slashMatches = useMemo(() => {
    if (!draft.startsWith('/')) return [] as SlashCmd[]
    const head = draft.split(' ')[0].toLowerCase()
    return SLASH_COMMANDS.filter((c) => c.cmd.startsWith(head)).slice(0, 6)
  }, [draft])

  const paletteMatches = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase()
    const friendList = Object.entries(friends)
    const friendMatches = q ? friendList.filter(([u]) => u.toLowerCase().includes(q)) : friendList.slice(0, 12)
    const friendNames = new Set(friendMatches.map(([u]) => u))
    const globalExtras: [string, string][] = globalSearchResults
      .filter((u) => !friendNames.has(u) && u !== me)
      .map((u) => [u, 'unknown'] as [string, string])
    return [...friendMatches, ...globalExtras].slice(0, 20)
  }, [paletteQuery, friends, globalSearchResults, me])

  useEffect(() => {
    if (globalSearchTimer.current) clearTimeout(globalSearchTimer.current)
    const q = paletteQuery.trim()
    if (q.length >= 2) {
      globalSearchTimer.current = setTimeout(() => {
        send({ type: 'search', body: q })
      }, 300)
    } else {
      setGlobalSearchResults([])
    }
  }, [paletteQuery, send])

  const sendFile = useCallback(async (file: File) => {
    if (!selected || !me || !sessionToken) {
      setErr('Sign in to send files')
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      setErr('File exceeds 25 MB')
      return
    }
    try {
      const fd = new FormData()
      fd.append('file', file)
      const resp = await fetch('/api/v1/upload', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      })
      if (!resp.ok) {
        setErr(`Upload failed: ${resp.status}`)
        return
      }
      const att = await resp.json() as FileAttachment
      const peerKey = peerKeysRef.current[selected]
      const plaintext = encodeFileBody(att)
      const body = peerKey ? encryptForPeer(plaintext, peerKey, keysRef.current.secretKey) : plaintext
      const msgId = newMsgId()
      send({ type: 'msg', sender: me, recipient: selected, body, msg_id: msgId })
      appendLog(me, '', true, { id: msgId, file: att })
      playPhazeSound('MessageOutgoing.wav')
    } catch (e) {
      setErr(`Upload error: ${(e as Error).message}`)
    }
  }, [selected, me, sessionToken, send, appendLog])

  const stopRecording = useCallback((cancel = false) => {
    const r = recorderRef.current
    if (!r) return
    recorderRef.current = null
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null }
    setRecording(false)
    if (cancel) {
      try { r.ondataavailable = null; r.onstop = null; r.stream.getTracks().forEach((t) => t.stop()) } catch { /* noop */ }
      try { r.stop() } catch { /* noop */ }
      recChunksRef.current = []
      return
    }
    // Real stop — the onstop handler will do the upload.
    try { r.stop() } catch { /* noop */ }
  }, [])

  const startRecording = useCallback(async () => {
    if (!selected || !sessionToken) {
      setErr('Sign in and open a chat to record voice')
      return
    }
    if (recording) { stopRecording(false); return }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setErr('Microphone access denied')
      return
    }
    const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
    let mimeType = ''
    for (const m of mimeCandidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) { mimeType = m; break }
    }
    const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    recorderRef.current = rec
    recChunksRef.current = []
    rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) recChunksRef.current.push(e.data) }
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      const dur = Math.max(1, Math.round((Date.now() - recStartRef.current) / 1000))
      const blob = new Blob(recChunksRef.current, { type: rec.mimeType || 'audio/webm' })
      recChunksRef.current = []
      // Wrap into a File so it lands cleanly on the upload endpoint.
      const ext = (rec.mimeType || '').includes('mp4') ? 'm4a' : (rec.mimeType || '').includes('ogg') ? 'ogg' : 'webm'
      const file = new File([blob], `voice-${Date.now()}-${dur}s.${ext}`, { type: rec.mimeType || 'audio/webm' })
      void sendFile(file)
    }
    recStartRef.current = Date.now()
    setRecDuration(0)
    setRecording(true)
    recTimerRef.current = setInterval(() => {
      setRecDuration(Math.round((Date.now() - recStartRef.current) / 1000))
    }, 250)
    // Auto-stop at 2 minutes to keep uploads reasonable
    rec.start()
    setTimeout(() => { if (recorderRef.current === rec) stopRecording(false) }, 2 * 60 * 1000)
  }, [selected, sessionToken, recording, stopRecording, sendFile])

  const reactTo = useCallback((line: ChatLine, emoji: string) => {
    if (!selected || !me) return
    send({ type: 'msg_react', sender: me, recipient: selected, msg_id: line.id, reaction: emoji })
    mutateMessage(selected, line.id, (l) => {
      const r = { ...(l.reactions || {}) }
      const users = new Set(r[emoji] || [])
      if (users.has(me)) users.delete(me)
      else users.add(me)
      if (users.size === 0) delete r[emoji]
      else r[emoji] = [...users]
      return { ...l, reactions: r }
    })
  }, [selected, me, send, mutateMessage])

  const [editingId, setEditingId] = useState<string | null>(null)
  const beginEdit = (line: ChatLine) => {
    setEditingId(line.id)
    setDraft(line.text)
  }
  const cancelEdit = () => { setEditingId(null); setDraft('') }
  const submitEdit = () => {
    if (!selected || !me || !editingId) return
    const text = draft.trim()
    if (!text) return
    const peer = peerKeysRef.current[selected]
    const body = peer ? encryptForPeer(text, peer, keysRef.current.secretKey) : text
    send({ type: 'msg_edit', sender: me, recipient: selected, msg_id: editingId, body })
    mutateMessage(selected, editingId, (l) => ({ ...l, text, edited: true }))
    setEditingId(null)
    setDraft('')
  }
  const deleteMessage = (line: ChatLine) => {
    if (!selected || !me) return
    if (!confirm('Delete this message for both of you?')) return
    send({ type: 'msg_delete', sender: me, recipient: selected, msg_id: line.id })
    mutateMessage(selected, line.id, (l) => ({ ...l, text: '', deleted: true, file: undefined }))
  }

  const handleDraftChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setDraft(v)
    const caret = e.target.selectionStart ?? v.length
    const upto = v.slice(0, caret)
    const m = /(?:^|\s)@([A-Za-z0-9_]{0,32})$/.exec(upto)
    if (m) {
      setMentionQuery(m[1].toLowerCase())
      setMentionIdx(0)
    } else {
      setMentionQuery(null)
    }
    if (selectedRef.current && meRef.current) {
      if (!outTypingTimerRef.current) {
        sendRef.current({ type: 'typing', recipient: selectedRef.current })
      }
      clearTimeout(outTypingTimerRef.current ?? undefined)
      outTypingTimerRef.current = setTimeout(() => { outTypingTimerRef.current = null }, 2000)
    }
  }

  // @mentions are a Skype 8 feature. Gating the match list rather than just
  // the popover switches off the keyboard handling too — an empty list makes
  // Tab and Enter fall through to their normal behaviour, which is what they
  // did before mentions existed.
  const mentionsOn = hasFeature(theme, 'mentions')
  const mentionMatches = useMemo(() => {
    if (!mentionsOn || mentionQuery === null) return [] as string[]
    const q = mentionQuery
    return Object.keys(friends).filter((u) => u.toLowerCase().startsWith(q)).slice(0, 6)
  }, [mentionsOn, mentionQuery, friends])

  const completeMention = useCallback((username: string) => {
    const inp = draftInputRef.current
    const caret = inp?.selectionStart ?? draft.length
    const before = draft.slice(0, caret).replace(/@([A-Za-z0-9_]{0,32})$/, `@${username} `)
    const after = draft.slice(caret)
    const next = before + after
    setDraft(next)
    setMentionQuery(null)
    queueMicrotask(() => {
      const el = draftInputRef.current
      if (el) {
        const pos = before.length
        el.focus()
        el.setSelectionRange(pos, pos)
      }
    })
  }, [draft])

  const doRegister = () => {
    setErr('')
    if (regUser.length < 3 || regUser.length > 32) { setErr('Username must be 3–32 characters'); return }
    if (regPass.length < 8) { setErr('Password must be at least 8 characters'); return }
    if (!regEmail.includes('@')) { setErr('Enter a valid email'); return }
    send({ type: 'register', sender: regUser, body: regPass, email: regEmail, token: inviteCode ?? undefined, ref_by: refBy ?? undefined })
  }

  const doVerify = () => {
    setErr('')
    if (!/^\d{6}$/.test(regCode.trim())) { setErr('Enter the 6-digit code from your email'); return }
    send({ type: 'verify_email', sender: regUser, body: regCode.trim() })
  }

  const totalUnread = useMemo(() => Object.values(unread).reduce((a, b) => a + b, 0), [unread])
  useEffect(() => {
    const base = 'Phaze'
    document.title = totalUnread > 0 ? `(${totalUnread}) ${base}` : base
    wails?.SetUnread(totalUnread)
  }, [totalUnread])

  return (
    <OSChrome theme={theme} enabled={osFrame && !wails}>
    {/* Two era classes, because they answer different questions.
        `skype-era` means "this is a recreation of a real Skype release",
        and switches off the Phaze chrome — the branded top bar, the
        floating nav, the footer, the support button — for all six.
        `classic-era` is the narrower Skype 3-7 house style: menu bar,
        compact list, no right-aligned bubbles. Skype 8 is an era but not
        a classic one, which is exactly the case the old single class
        couldn't express. */}
    <div className={`app theme-${theme}${isSkypeEra(theme) ? ' skype-era' : ''}${isClassicSkype(theme) ? ' classic-era' : ''}${wails ? ' desktop-app' : ''}`}>
      {wails && (
        <DesktopTitleBar
          onMinimise={() => wails.WindowMinimise()}
          onMaximise={() => wails.WindowToggleMaximise()}
          onClose={() => wails.WindowClose()}
        />
      )}
      {snow && <Snowflakes />}
      <header className="top">
        <div className="brand">
          <h1>Phaze</h1>
        </div>
        {me && (
          <button className="palette-hint" title="Quick switcher (⌘K)" onClick={() => { setPaletteOpen(true); setPaletteQuery(''); setPaletteIdx(0) }}>
            <span>Search friends…</span>
            <kbd>⌘K</kbd>
          </button>
        )}
        <span className={`pill ${conn === 'open' ? 'ok' : conn === 'connecting' ? 'warn' : ''}`}>
          {me ? (conn === 'open' ? 'online' : conn) : conn}
        </span>
        <button
          className="settings-gear"
          title={`Theme: ${themeLabel(theme)} — click to cycle (View menu has the full picker)`}
          onClick={() => setTheme(nextTheme(theme))}
        >{themeIcon(theme)}</button>
        <button
          className="settings-gear"
          title={snow ? 'Turn off snow' : 'Let it snow'}
          onClick={() => setSnow((s) => !s)}
        >{snow ? '🌨' : '❄'}</button>
        {me && hasFeature(theme, 'remote_control') && (
          <button className="settings-gear" title="Remote Control" onClick={() => setRemoteOpen(true)}>🖥</button>
        )}
        {me && (
          <button className="settings-gear" title="Settings" onClick={() => setSettingsOpen(true)}>⚙</button>
        )}
        {me && <span className="me">@{me}</span>}
      </header>

      {/* ── Skype 7 menu bar (skype7 theme only — see .skype-menubar CSS) ── */}
      {me && (
        <nav className="skype-menubar" onMouseLeave={() => setMenuOpen(null)}>
          {(['Skype', 'Contacts', 'Conversation', 'Call', 'View', 'Tools', 'Help'] as const).map((label) => (
            <div key={label} className="skype-menu">
              <button
                type="button"
                className={menuOpen === label ? 'on' : ''}
                onClick={() => setMenuOpen(menuOpen === label ? null : label)}
              >{label}</button>
              {menuOpen === label && (
                <div className="skype-menu-dropdown">
                  {label === 'Skype' && (
                    <button type="button" onClick={() => { setSettingsOpen(true); setMenuOpen(null) }}>Settings…</button>
                  )}
                  {label === 'Contacts' && (
                    <>
                      <button type="button" onClick={() => { setAddOpen(true); setAddFriend(''); setAddStatus(null); setMenuOpen(null) }}>Add a contact…</button>
                      <button type="button" onClick={() => { setNewGroupOpen(true); setMenuOpen(null) }}>Create a group…</button>
                      <button type="button" onClick={() => { setPaletteOpen(true); setPaletteQuery(''); setPaletteIdx(0); setMenuOpen(null) }}>Search friends… ⌘K</button>
                    </>
                  )}
                  {label === 'Conversation' && (
                    <button type="button" disabled={!selected} onClick={() => { setSearchOpen(true); setMenuOpen(null) }}>Search this conversation</button>
                  )}
                  {label === 'Call' && (
                    <>
                      <button type="button" disabled={!selected} onClick={() => { startCall('audio'); setMenuOpen(null) }}>Call{selected ? ` ${selected}` : ''}</button>
                      <button type="button" disabled={!selected} onClick={() => { startCall('video'); setMenuOpen(null) }}>Video call{selected ? ` ${selected}` : ''}</button>
                    </>
                  )}
                  {label === 'View' && (
                    <>
                      <div className="skype-menu-sectionlabel">Theme</div>
                      {SELECTABLE_THEMES.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className={t.id === theme ? 'skype-menu-item on' : 'skype-menu-item'}
                          onClick={() => { setTheme(t.id); setMenuOpen(null) }}
                          title={t.hint}
                        >
                          <span className="skype-menu-item-icon">{t.icon}</span>
                          <span className="skype-menu-item-label">{t.label}</span>
                          {t.hint && <span className="skype-menu-item-hint">{t.hint}</span>}
                          {t.id === theme && <span className="skype-menu-item-check">✓</span>}
                        </button>
                      ))}
                      <div className="skype-menu-sep" />
                      <button
                        type="button"
                        onClick={() => { setOsFrame((v) => !v); setMenuOpen(null) }}
                        title="Frame the app in the desktop OS this Skype era shipped on"
                      >{osFrame ? 'Hide desktop frame' : 'Show desktop frame'}</button>
                      <button type="button" onClick={() => { setSnow((s) => !s); setMenuOpen(null) }}>{snow ? 'Turn off snow' : 'Let it snow'}</button>
                    </>
                  )}
                  {label === 'Tools' && (
                    <button type="button" onClick={() => { setRemoteOpen(true); setMenuOpen(null) }}>Remote Control…</button>
                  )}
                  {label === 'Help' && (
                    <>
                      <a href="https://phazechat.world/support" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(null)}>Get help</a>
                      <a href="https://github.com/jakes1345/phaze" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(null)}>View source on GitHub</a>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </nav>
      )}

      {/* ── Floating bottom nav ─────────────────────────────────── */}
      {me && (
        <nav className="floating-nav">
          <button type="button" className={view === 'dms' ? 'on' : ''} onClick={() => setView('dms')}>
            <span className="nav-icon">💬</span>
            <span className="nav-label">Home</span>
          </button>
          {hasFeature(theme, 'spaces') && (
            <button type="button" className={view === 'spaces' ? 'on' : ''} onClick={() => setView('spaces')}>
              <span className="nav-icon">🌐</span>
              <span className="nav-label">Spaces</span>
            </button>
          )}
          {hasFeature(theme, 'live_streams') && (
            <button type="button" className={view === 'live' ? 'on' : ''} onClick={() => setView('live')}>
              <span className="nav-icon">🔴</span>
              <span className="nav-label">Live</span>
            </button>
          )}
          <button type="button" onClick={() => setSettingsOpen(true)}>
            <span className="nav-icon">👤</span>
            <span className="nav-label">Profile</span>
          </button>
        </nav>
      )}

      {err && <div className="banner">{err}</div>}

      {/* Someone signed in from an unrecognised device; their session is
          held until this is answered. */}
      {deviceAsk && (
        <div className="device-ask" role="alertdialog" aria-label="New sign-in attempt">
          <div className="device-ask-body">
            <strong>New sign-in to your account</strong>
            <span className="device-ask-detail">
              {deviceAsk.label}
              {deviceAsk.ip ? ` · ${deviceAsk.ip}` : ''}
              {` · ${new Date(deviceAsk.ts).toLocaleTimeString()}`}
            </span>
            <span className="device-ask-hint">
              If this wasn't you, deny it — they stay locked out and you stay signed in.
            </span>
          </div>
          <div className="device-ask-actions">
            <button
              type="button"
              className="device-ask-deny"
              onClick={() => { send({ type: 'device_deny', challenge_id: deviceAsk.id }); setDeviceAsk(null) }}
            >Deny</button>
            <button
              type="button"
              className="device-ask-approve"
              onClick={() => { send({ type: 'device_approve', challenge_id: deviceAsk.id }); setDeviceAsk(null) }}
            >It's me</button>
          </div>
        </div>
      )}


      {settingsOpen && me && (
        <Settings
          me={me}
          sessionToken={sessionToken}
          send={send}
          subscribe={subscribe}
          onClose={() => { setSettingsOpen(false); setSettingsInitialTab('profile') }}
          onSignOut={() => {
            localStorage.removeItem(SESSION_KEY)
            fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
            setSessionToken(null)
            setMe(null)
            setSettingsOpen(false)
            setSelected(null)
            setFriends({})
            setPending([])
            setView('dms')
          }}
          initialTab={settingsInitialTab}
          onSetBackupPin={async (pin: string) => {
            const blob = await encryptKeyBackup(keysRef.current.publicKey, keysRef.current.secretKey, pin)
            send({ type: 'key_backup_put', key_backup: blob })
          }}
          onDeleteBackup={() => send({ type: 'key_backup_delete' })}
        />
      )}

      {me && remoteOpen && (
        <Suspense fallback={null}>
        <RemoteControl
          me={me}
          send={send}
          subscribe={subscribe}
          turn={null}
          onClose={() => setRemoteOpen(false)}
        />
        </Suspense>
      )}

      {me && paletteOpen && (
        <div className="palette-overlay" onClick={() => setPaletteOpen(false)}>
          <div className="palette" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              placeholder="Search friends, jump to a chat…"
              value={paletteQuery}
              onChange={(e) => { setPaletteQuery(e.target.value); setPaletteIdx(0) }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setPaletteIdx((i) => Math.min(i + 1, paletteMatches.length - 1)) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setPaletteIdx((i) => Math.max(0, i - 1)) }
                else if (e.key === 'Enter') {
                  const pick = paletteMatches[paletteIdx]
                  if (pick) { openChat(pick[0]); setPaletteOpen(false) }
                }
              }}
            />
            <div className="palette-list">
              {paletteMatches.length === 0 && (
                <div className="palette-empty">{paletteQuery.length >= 2 ? 'No users found.' : 'Type to search all Phaze users…'}</div>
              )}
              {paletteMatches.map(([u, st], i) => {
                const isFriend = u in friends
                const last = isFriend ? lastLineFor(me, u) : null
                return (
                  <button
                    key={u}
                    type="button"
                    className={`palette-row ${i === paletteIdx ? 'on' : ''}`}
                    onMouseEnter={() => setPaletteIdx(i)}
                    onClick={() => {
                      if (isFriend) { openChat(u); setPaletteOpen(false) }
                      else { sendFriendRequest(u); setPaletteOpen(false) }
                    }}
                  >
                    <span className="avatar" style={{ background: avatarColor(u) }}>
                      {u[0]?.toUpperCase()}
                      <AvatarImg user={u} />
                      <span className="avatar-dot" style={{ background: isFriend ? statusColor(st) : '#555' }} />
                    </span>
                    <span className="palette-meta">
                      <span className="palette-name">{u}</span>
                      <span className="palette-preview">{isFriend ? (last?.text || st) : 'Click to send friend request'}</span>
                    </span>
                    {last && <span className="palette-time">{relTime(last.ts)}</span>}
                    {!isFriend && <span className="palette-time" style={{ color: '#863bff' }}>+ Add</span>}
                  </button>
                )
              })}
            </div>
            <div className="palette-foot">
              <span><kbd>↑↓</kbd> navigate</span>
              <span><kbd>↵</kbd> open</span>
              <span><kbd>esc</kbd> close</span>
            </div>
          </div>
        </div>
      )}


      {/* ── Onboarding (first sign-in only) ─────────────────────── */}
      {me && sessionToken && onboardingOpen && (
        <Suspense fallback={null}>
          <Onboarding
            me={me}
            sessionToken={sessionToken}
            onAddFriend={(name) => sendFriendRequest(name)}
            onJump={(v) => setView(v)}
            onClose={() => setOnboardingOpen(false)}
          />
        </Suspense>
      )}

      {/* ── Report abuse dialog ──────────────────────────────────── */}
      {reportTarget && (
        <div className="restore-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setReportTarget(null); setReportSent(false) } }}>
          <div className="restore-card">
            {reportSent ? (
              <>
                <h2>Report sent</h2>
                <p className="muted small">Thanks for letting us know. Our team will review this report.</p>
                <button type="button" onClick={() => { setReportTarget(null); setReportSent(false) }}>Close</button>
              </>
            ) : (
              <>
                <h2>Report {reportTarget}</h2>
                <p className="muted small">Describe what's happening so our team can review it.</p>
                <textarea
                  autoFocus
                  placeholder="Reason for report (e.g. harassment, spam…)"
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  rows={4}
                  style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
                />
                <div className="row">
                  <button
                    type="button"
                    disabled={!reportReason.trim()}
                    onClick={() => {
                      if (!me || !reportReason.trim()) return
                      send({ type: 'report_abuse', sender: me, recipient: reportTarget!, body: reportReason.trim() })
                      setReportSent(true)
                    }}
                  >Submit report</button>
                  <button type="button" className="link-btn" onClick={() => { setReportTarget(null); setReportSent(false) }}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Support chat bubble (always available) ───────────────── */}
      <SupportBubble me={me} />
      {showSupport && <SupportForm me={me} bmcUrl={bmcUrl} onClose={() => setShowSupport(false)} />}

      {/* ── User profile modal ───────────────────────────────────── */}
      {profileUser && me && (
        <UserProfile
          username={profileUser}
          me={me}
          friends={friends}
          send={send}
          onClose={() => setProfileUser(null)}
          onStartDM={(u) => { setView('dms'); openChat(u) }}
        />
      )}

      {/* ── Call overlay ─────────────────────────────────────────── */}
      {callState && isClassicSkype(theme) && (
        <CallScreen
          state={callState}
          jitsiUrl={callState.status === 'active' && jitsiRoom ? `https://meet.jit.si/${jitsiRoom}` : null}
          avatarBg={avatarColor(callState.peer)}
          onAnswer={acceptCall}
          onHangUp={hangUp}
        />
      )}
      {/* !isClassicSkype, not `theme !== 'skype7'`.
          This condition dates from when only Skype 7 had the classic call
          screen above. Widening that one to every classic era left this one
          untouched, so Skype 3, 4, 5 and 6 rendered BOTH call UIs stacked
          on top of each other for the whole duration of a call. */}
      {callState && !isClassicSkype(theme) && (
        <div className="call-overlay">
          {callState.status === 'active' && jitsiRoom && (
            <iframe
              src={`https://meet.jit.si/${jitsiRoom}`}
              allow="camera; microphone; display-capture; fullscreen"
              style={{ width: '100%', flex: 1, border: 'none', minHeight: 0 }}
              title="Call"
            />
          )}
          <div className="call-card">
            <div className="call-avatar">{callState.peer[0].toUpperCase()}</div>
            <div className="call-peer-name">{callState.peer}</div>
            <div className="call-status-text">
              {callState.status === 'ringing' && callState.direction === 'outgoing' && 'Calling…'}
              {callState.status === 'ringing' && callState.direction === 'incoming' && `${callState.type === 'video' ? '📹' : '☎'} Incoming ${callState.type} call`}
              {callState.status === 'active' && `${String(Math.floor(callSeconds / 60)).padStart(2, '0')}:${String(callSeconds % 60).padStart(2, '0')}`}
            </div>
            <div className="call-controls">
              {callState.direction === 'incoming' && callState.status === 'ringing' ? (
                <>
                  <button className="call-btn-accept" onClick={acceptCall}>Accept</button>
                  <button className="call-btn-decline" onClick={hangUp}>Decline</button>
                </>
              ) : (
                <button className="call-btn-end" onClick={hangUp}>End call</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Global notice popup ────────────────────────────────── */}
      {globalNotice && (
        <div className="restore-overlay" onClick={() => setGlobalNotice(null)}>
          <div className="restore-card" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <h2 style={{ color: 'var(--brand)', fontSize: '1.2rem' }}>Notice from {globalNotice.from}</h2>
            <p style={{ margin: '1rem 0', fontSize: '0.95rem', lineHeight: 1.6 }}>{globalNotice.msg}</p>
            <button type="button" onClick={() => setGlobalNotice(null)} style={{ padding: '0.6rem 2rem', borderRadius: 10, background: 'var(--brand)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Got it</button>
          </div>
        </div>
      )}

      {/* ── What's New changelog popup ────────────────────────── */}
      {/* ── What's New — feature showcase carousel ────────────── */}
      {me && !changelogSeen && !changelogOpen && (
        <div className="wn-banner" onClick={() => setChangelogOpen(true)}>
          <span className="wn-banner-icon">🎉</span>
          <span className="wn-banner-text"><strong>What's new</strong> — tap to see what changed.</span>
          <button type="button" className="wn-banner-dismiss" onClick={(e) => { e.stopPropagation(); setChangelogSeen(true); localStorage.setItem('phaze_changelog_v', '2025-05-25') }}>✕</button>
        </div>
      )}

      {changelogOpen && (
        <div className="wn-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setChangelogOpen(false); setChangelogSeen(true); localStorage.setItem('phaze_changelog_v', '2025-05-25') } }}>
          <div className="wn-modal">
            <button type="button" className="wn-close" onClick={() => { setChangelogOpen(false); setChangelogSeen(true); localStorage.setItem('phaze_changelog_v', '2025-05-25') }}>✕</button>
            <div className="wn-header">
              <img src={faviconUrl} alt="" className="wn-logo" />
              <h2>What's New</h2>
              <p>Here's what changed.</p>
            </div>
            <div className="wn-card" style={{ borderColor: changelogFeatures[changelogSlide].color + '33' }}>
              <div className="wn-card-icon" style={{ background: changelogFeatures[changelogSlide].color + '18', color: changelogFeatures[changelogSlide].color }}>
                {changelogFeatures[changelogSlide].icon}
              </div>
              <h3 className="wn-card-title">{changelogFeatures[changelogSlide].title}</h3>
              <p className="wn-card-desc">{changelogFeatures[changelogSlide].desc}</p>
            </div>
            <div className="wn-dots">
              {changelogFeatures.map((_, i) => (
                <button key={i} type="button" className={`wn-dot ${i === changelogSlide ? 'on' : ''}`} onClick={() => setChangelogSlide(i)} style={i === changelogSlide ? { background: changelogFeatures[i].color } : {}} />
              ))}
            </div>
            <div className="wn-nav">
              {changelogSlide > 0 && (
                <button type="button" className="wn-btn secondary" onClick={() => setChangelogSlide((s) => s - 1)}>Back</button>
              )}
              <div style={{ flex: 1 }} />
              {changelogSlide < changelogFeatures.length - 1 ? (
                <button type="button" className="wn-btn primary" onClick={() => setChangelogSlide((s) => s + 1)}>Next</button>
              ) : (
                <button type="button" className="wn-btn primary" onClick={() => { setChangelogOpen(false); setChangelogSeen(true); localStorage.setItem('phaze_changelog_v', '2025-05-25') }}>Let's go</button>
              )}
            </div>
            <div className="wn-counter">{changelogSlide + 1} / {changelogFeatures.length}</div>
          </div>
        </div>
      )}

      {/* ── Group call invite banner ─────────────────────────── */}
      {groupCallInvite && (
        <div className="banner" style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
          <span>👥 <strong>{groupCallInvite.from}</strong> invited you to a group call</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" style={{ padding: '4px 12px', borderRadius: 6, background: 'var(--brand)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }} onClick={() => { setGroupCallRoom(groupCallInvite.room); setGroupCallInvite(null) }}>Join</button>
            <button type="button" style={{ padding: '4px 12px', borderRadius: 6, background: 'transparent', color: 'var(--muted)', border: '1px solid var(--input-border)', cursor: 'pointer' }} onClick={() => setGroupCallInvite(null)}>Decline</button>
          </div>
        </div>
      )}

      {/* ── Group call overlay ────────────────────────────────── */}
      {me && groupCallRoom && (
        <div className="call-overlay" style={{ flexDirection: 'column', gap: '1rem', padding: '2rem' }}>
          <Suspense fallback={null}>
          <VoiceRoom
            me={me}
            channelId={groupCallRoom}
            channelName="Group Call"
            send={send}
            subscribe={subscribe}
            turn={null}
          />
          </Suspense>
          <button
            type="button"
            className="call-btn-end"
            onClick={() => {
              send({ type: 'voice_leave', channel_id: groupCallRoom })
              setGroupCallRoom(null)
            }}
          >Leave group call</button>
        </div>
      )}

      {me && view === 'spaces' ? (
        <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading Spaces…</div>}>
        <Spaces
          me={me}
          send={send}
          subscribe={subscribe}
          turn={turn}
          onUserClick={setProfileUser}
          uploadAttachment={async (file) => {
            if (!me) return null
            const fd = new FormData()
            fd.append('file', file)
            const resp = await fetch('/api/v1/upload', {
              method: 'POST',
              credentials: 'include',
              body: fd,
            })
            if (!resp.ok) return null
            return await resp.json()
          }}
        />
        </Suspense>
      ) : me && view === 'live' ? (
        <Suspense fallback={null}><LivePage me={me} send={send} subscribe={subscribe} turn={turn} /></Suspense>
      ) : (
        <>
        {/* ── Auth (not logged in) ─────────────────────────────── */}
        {!me && (
          <main className="grid">
            <div className="hub-auth">
              <div className="auth-hero">
                <img src={faviconUrl} alt="Phaze" className="auth-hero-logo" />
                <h2 className="auth-hero-title">Phaze</h2>
                <p className="auth-hero-sub">Chat, calls, and spaces. End-to-end encrypted.</p>
              </div>
              <section className="panel">
                {deviceVerify ? (
                  <>
                    <h2>Approve this device</h2>
                    <p className="device-verify-copy">
                      This is the first time you've signed in from <strong>{deviceVerify.label}</strong>.
                      {deviceVerify.codeSent
                        ? ' We emailed you a 6-digit code.'
                        : ' Approve it from a device where you\u2019re already signed in.'}
                    </p>
                    <form className="form" onSubmit={(e) => { e.preventDefault(); submitDeviceCode(deviceCode) }}>
                      <input
                        placeholder="6-digit code"
                        value={deviceCode}
                        onChange={(e) => setDeviceCode(e.target.value)}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        autoFocus
                      />
                      <button type="submit" disabled={deviceCode.trim().length < 6}>Verify</button>
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => { setDeviceVerify(null); setDeviceCode(''); setErr('') }}
                      >Back to sign in</button>
                    </form>
                    <p className="device-verify-note">
                      Your other sessions are still signed in and unaffected. If this wasn't you,
                      ignore this and change your password.
                    </p>
                  </>
                ) : mode === 'login' ? (
                  <>
                  <h2>Sign in to Phaze</h2>
                  <form className="form" onSubmit={(e) => { e.preventDefault(); doAuth(loginUser.trim(), loginPass, loginTotp.trim()) }}>
                    <input placeholder="Username" value={loginUser} onChange={(e) => setLoginUser(e.target.value)} autoComplete="username" />
                    <input type="password" placeholder="Password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} autoComplete="current-password" />
                    {needsTotp && <input placeholder="TOTP code or backup code (e.g. abcde-f0123)" value={loginTotp} onChange={(e) => setLoginTotp(e.target.value)} autoFocus />}
                    <button type="submit">Sign in</button>
                    <button type="button" className="link-btn" onClick={() => { setMode('register'); setErr(''); setNeedsTotp(false); setRegStep('form') }}>Create an account</button>
                    <button type="button" className="link-btn" onClick={() => { setMode('forgot'); setErr(''); setNeedsTotp(false) }}>Forgot password?</button>
                    <button type="button" className="link-btn" onClick={() => { setMode('link'); setErr(''); setNeedsTotp(false) }}>Sign in with a link code from another device</button>
                  </form>
                  </>
                ) : mode === 'forgot' ? (
                  <div className="form">
                    <p className="muted small">Enter the email address on your account. We'll send a reset link.</p>
                    <input type="email" placeholder="Email address" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} autoFocus />
                    <button type="button" onClick={() => {
                      if (!forgotEmail.includes('@')) { setErr('Enter a valid email'); return }
                      send({ type: 'forgot_password', email: forgotEmail })
                      setErr('If an account matches, a reset link has been sent to your email.')
                    }}>Send reset link</button>
                    <button type="button" className="link-btn" onClick={() => { setMode('login'); setErr('') }}>Back to sign in</button>
                  </div>
                ) : mode === 'link' ? (
                  <div className="form">
                    <p className="muted small">Open Phaze on a device you're already signed into → Settings → 💾 Backup &amp; Devices → "Generate link code". Enter the code below or scan a QR code.</p>
                    
                    {cameraActive ? (
                      <div className="qr-scanner-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 12 }}>
                        <video ref={videoRef} style={{ width: '100%', maxWidth: 280, borderRadius: 8, border: '2px solid #232328', background: '#000' }} />
                        <button type="button" className="link-btn" onClick={stopCamera} style={{ marginTop: 8 }}>Stop Camera</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, marginBottom: 12, width: '100%' }}>
                        <button type="button" className="settings-btn" style={{ flex: 1, fontSize: '0.8rem', padding: '8px 12px' }} onClick={startCamera}>📸 Scan with Camera</button>
                        <label className="settings-btn" style={{ flex: 1, fontSize: '0.8rem', padding: '8px 12px', textAlign: 'center', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          📂 Upload Image
                          <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
                        </label>
                      </div>
                    )}

                    <input placeholder="Link code / Scanned token" value={linkInput} onChange={(e) => setLinkInput(e.target.value.trim())} autoFocus maxLength={200} />
                    <button type="button" disabled={linkBusy || linkInput.length < 8} onClick={() => {
                      setLinkBusy(true)
                      setErr('Waiting for approval on your other device…')
                      const tok = linkInput
                      const poll = setInterval(() => sendRef.current({ type: 'link_check', token: tok }), 2500)
                      sendRef.current({ type: 'link_check', token: tok })
                      setTimeout(() => clearInterval(poll), 5 * 60 * 1000)
                    }}>{linkBusy ? 'Waiting…' : 'Sign in with code'}</button>
                    <button type="button" className="link-btn" onClick={() => { stopCamera(); setMode('login'); setLinkInput(''); setLinkBusy(false); setErr('') }}>Back to sign in</button>
                  </div>
                ) : regStep === 'form' ? (
                  <form className="form" onSubmit={(e) => { e.preventDefault(); doRegister() }}>
                    {refBy && <p className="invite-banner">👋 <strong>{refBy}</strong> invited you to Phaze!</p>}
                    <input placeholder="Choose a username (3–32 chars)" value={regUser} onChange={(e) => setRegUser(e.target.value)} autoComplete="username" />
                    <input type="email" placeholder="Email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} autoComplete="email" required />
                    <input type="password" placeholder="Password (8+ chars)" value={regPass} onChange={(e) => setRegPass(e.target.value)} autoComplete="new-password" />
                    <button type="submit">Create account</button>
                    <button type="button" className="link-btn" onClick={() => { setMode('login'); setErr('') }}>Back to sign in</button>
                  </form>
                ) : (
                  <div className="form">
                    <p className="muted small">We sent a verification link to <strong>{regEmail}</strong>. Click it, or enter the code below.</p>
                    <input inputMode="numeric" pattern="\d{6}" maxLength={6} placeholder="123456" value={regCode} onChange={(e) => setRegCode(e.target.value)} />
                    <button type="button" onClick={doVerify}>Verify email</button>
                    <button type="button" className="link-btn" onClick={() => {
                      send({ type: 'resend_verification', sender: regUser, email: regEmail })
                      setErr('Verification code resent. Check your email.')
                    }}>Resend code</button>
                    <button type="button" className="link-btn" onClick={() => { setMode('login'); setErr(''); setRegStep('form') }}>Cancel</button>
                  </div>
                )}
              </section>
            </div>
          </main>
        )}

        {/* ── Hub view (logged in, DMs) ───────────────────────────── */}
        {me && sessionToken && hasFeature(theme, 'stories') && <Suspense fallback={null}><Stories me={me} sessionToken={sessionToken} /></Suspense>}
        {me && (
          <main className="grid">
            <div className={`hub-content ${selected ? 'chat-open' : ''}`}>
              {/* ── Sidebar: search + contacts list ───────────────── */}
              <div className="hub-sidebar">
                {/* ── Skype 7 me-bar at sidebar top ──────────────── */}
                {me && (
                  <div className="hub-me-bar">
                    <span className="avatar hub-me-avatar" style={{ background: avatarColor(me) }}>
                      {me[0]?.toUpperCase()}
                      <AvatarImg user={me} />
                      <span className="hub-me-presence"><PresenceIcon status={shownStatus} size={11} /></span>
                    </span>
                    <span className="hub-me-info">
                      <span className="hub-me-name">{me}</span>
                      <button type="button" className="hub-me-status" onClick={() => setStatusMenuOpen((o) => !o)}>
                        <PresenceIcon status={shownStatus} size={10} /> {shownStatus} ▾
                      </button>
                    </span>
                    <button className="hub-me-settings" onClick={() => setSettingsOpen(true)} title="Settings">⚙</button>
                    {statusMenuOpen && (
                      <div className="presence-menu" onMouseLeave={() => setStatusMenuOpen(false)}>
                        {STATUSES.map((s) => (
                          <button key={s} type="button" className={s === myStatus ? 'on' : ''}
                            onClick={() => { pickStatus(s); setStatusMenuOpen(false) }}>
                            <PresenceIcon status={s} /> {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {me && (
                  <div className="hub-mood-bar">
                    <MoodEditor value={myMood} onSave={saveMood} />
                  </div>
                )}
                {/* Each tab carries a label as well as its icon. The classic
                    eras hide the label and show icons only; Skype 8 stacks
                    the label under the icon, the way its nav strip did. */}
                <div className="sidebar-tabs">
                  <button type="button" title="Contacts" className={view === 'contacts' ? 'on' : ''} onClick={() => setView('contacts')}>
                    <IconPerson /><span className="tab-label">Contacts</span>
                  </button>
                  <button type="button" title="Recent" className={view === 'dms' ? 'on' : ''} onClick={() => setView('dms')}>
                    <IconClock /><span className="tab-label">Chats</span>
                  </button>
                  {hasFeature(theme, 'spaces') && (
                    <button type="button" title="Spaces" className={view === 'spaces' ? 'on' : ''} onClick={() => setView('spaces')}>
                      #<span className="tab-label">Spaces</span>
                    </button>
                  )}
                  {hasFeature(theme, 'live_streams') && (
                    <button type="button" title="Live" className={`tab-live ${view === 'live' ? 'on' : ''}`} onClick={() => setView('live')}>
                      <IconLive /><span className="tab-label">Live</span>
                    </button>
                  )}
                </div>
                <div className="hub-add-friend">
                  <div className="form">
                    <input
                      placeholder="Search contacts…"
                      value={contactFilter}
                      onChange={(e) => setContactFilter(e.target.value)}
                    />
                    <button type="button" title="Add contact" onClick={() => { setAddOpen(true); setAddFriend(''); setAddStatus(null) }}>+</button>
                  </div>
                </div>

                {/* ── Add contact modal ──────────────────────────────── */}
                {addOpen && (
                  <div className="add-modal-overlay" onClick={() => setAddOpen(false)}>
                    <div className="add-modal" onClick={(e) => e.stopPropagation()}>
                      <div className="add-modal-title">Add contact</div>
                      <input
                        className="add-modal-input"
                        placeholder="Enter their username…"
                        value={addFriend}
                        autoFocus
                        onChange={(e) => setAddFriend(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && addFriend.trim()) {
                            sendFriendRequest(addFriend.trim())
                            setAddStatus(`Request sent to ${addFriend.trim()}`)
                            setAddFriend('')
                          }
                          if (e.key === 'Escape') setAddOpen(false)
                        }}
                      />
                      {addStatus && <p className="add-modal-status">{addStatus}</p>}
                      <div className="add-modal-actions">
                        <button
                          type="button"
                          className="add-modal-send"
                          disabled={!addFriend.trim()}
                          onClick={() => {
                            if (!addFriend.trim()) return
                            sendFriendRequest(addFriend.trim())
                            setAddStatus(`Request sent to ${addFriend.trim()}`)
                            setAddFriend('')
                          }}
                        >Send request</button>
                        <button type="button" className="add-modal-cancel" onClick={() => setAddOpen(false)}>Close</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── New group dialog ───────────────────────────────── */}
                {newGroupOpen && (
                  <div className="add-modal-overlay" onClick={() => setNewGroupOpen(false)}>
                    <div className="add-modal" onClick={(e) => e.stopPropagation()}>
                      <div className="add-modal-title">New group chat</div>
                      <input
                        className="add-modal-input"
                        placeholder="Group name…"
                        value={newGroupName}
                        autoFocus
                        onChange={(e) => setNewGroupName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Escape') setNewGroupOpen(false) }}
                      />
                      <div className="group-member-list">
                        {Object.keys(friends).length === 0 && (
                          <p style={{ fontSize: 13, color: '#888', margin: '8px 0' }}>Add contacts first to include them in a group.</p>
                        )}
                        {Object.keys(friends).map((f) => (
                          <label key={f} className="group-member-row">
                            <input
                              type="checkbox"
                              checked={newGroupMembers.includes(f)}
                              onChange={() => setNewGroupMembers((prev) =>
                                prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
                              )}
                            />
                            <span className="avatar" style={{ background: avatarColor(f), width: 22, height: 22, fontSize: 11, lineHeight: '22px' }}>{f[0]?.toUpperCase()}</span>
                            <span>{f}</span>
                          </label>
                        ))}
                      </div>
                      <div className="add-modal-actions">
                        <button
                          type="button"
                          className="add-modal-send"
                          disabled={!newGroupName.trim() || newGroupMembers.length === 0}
                          onClick={() => {
                            if (!newGroupName.trim() || newGroupMembers.length === 0 || !me) return
                            const id = `${me}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
                            sendRef.current({
                              type: 'convo_create',
                              convo_id: id,
                              convo_name: newGroupName.trim(),
                              members: [me, ...newGroupMembers],
                            })
                            setNewGroupOpen(false)
                          }}
                        >Create</button>
                        <button type="button" className="add-modal-cancel" onClick={() => setNewGroupOpen(false)}>Cancel</button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="hub-friends">
                  {/* Incoming requests */}
                  {pending.length > 0 && (
                    <div className="pending-section">
                      {pending.map((u) => (
                        <div key={u} className="pending-row">
                          <span className="avatar" style={{ background: avatarColor(u) }}>
                            {u[0]?.toUpperCase()}
                            <AvatarImg user={u} />
                          </span>
                          <span className="pending-info">
                            <span className="pending-name">{u}</span>
                            <span className="pending-label">wants to connect</span>
                          </span>
                          <button type="button" className="pending-accept" onClick={() => acceptFriend(u)}>Accept</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {view === 'contacts' ? (
                    <ContactsView friends={friends} moods={moods} onOpen={(u) => { openChat(u); setView('dms') }} />
                  ) : (
                  <>
                  {Object.keys(friends).length === 0 && (
                    <div className="friends-empty">
                      <div className="friends-empty-icon">💬</div>
                      <p className="friends-empty-title">No contacts yet</p>
                      <p className="friends-empty-sub">Add someone by their username to get started.</p>
                      <button type="button" className="friends-empty-btn" onClick={() => { setAddOpen(true); setAddFriend(''); setAddStatus(null) }}>Add your first contact</button>
                    </div>
                  )}

                  {Object.keys(friends).length > 0 && <div className="sidebar-section-label">Messages</div>}
                  <ul className="list">
                    {(() => {
                      const rows = Object.entries(friends)
                        .map(([u, st]) => ({
                          u, st,
                          last: lastLineFor(me, u) ?? (friendLastTs[u] ? { text: st, ts: friendLastTs[u] } : null),
                        }))
                        .filter(({ u }) => !contactFilter.trim() || u.toLowerCase().includes(contactFilter.toLowerCase()))
                        .sort((a, b) => (b.last?.ts ?? 0) - (a.last?.ts ?? 0))
                      let lastGroup = ''
                      return rows.map(({ u, st, last }) => {
                      const group = last ? dateSepLabel(last.ts) : ''
                      const showHeader = isClassicSkype(theme) && group !== '' && group !== lastGroup
                      if (group) lastGroup = group
                      return (
                      <li key={u}>
                        {showHeader && <div className="convo-date-header">{group}</div>}
                        <button type="button" className={`friend-row ${selected === u ? 'sel' : ''}`} onClick={() => openChat(u)}>
                          <span className="avatar" style={{ background: avatarColor(u) }}>
                            {u[0]?.toUpperCase()}
                            <AvatarImg user={u} />
                            {isClassicSkype(theme)
                              ? <span className="avatar-presence"><PresenceIcon status={st} size={11} /></span>
                              : <span className="avatar-dot" data-online={st === 'Online' ? '' : undefined} style={{ background: statusColor(st) }} />}
                          </span>
                          <span className="friend-meta">
                            <span className="friend-line">
                              <span className="friend-name">{u}</span>
                              {last && <span className="friend-time">{relTime(last.ts)}</span>}
                            </span>
                            <span className="friend-line">
                              <span className="friend-preview">{last?.text || st}</span>
                              {unread[u] > 0 && selected !== u && (
                                <span className="unread-badge">{unread[u] > 99 ? '99+' : unread[u]}</span>
                              )}
                            </span>
                          </span>
                        </button>
                      </li>
                      )
                      })
                    })()}
                    {Object.keys(friends).length > 0 && contactFilter.trim() &&
                      Object.keys(friends).filter(u => u.toLowerCase().includes(contactFilter.toLowerCase())).length === 0 && (
                      <li className="no-filter-match">No contacts match "{contactFilter}"</li>
                    )}
                  </ul>

                  {/* Group chats section */}
                  {convos.length > 0 && <div className="sidebar-section-label">Group chats</div>}
                  <ul className="list">
                    {convos.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className={`friend-row ${selectedConvo === c.id ? 'sel' : ''}`}
                          onClick={() => { setSelectedConvo(c.id); setSelected(null) }}
                        >
                          <span className="avatar group-avatar">
                            {c.name[0]?.toUpperCase()}
                          </span>
                          <span className="friend-meta">
                            <span className="friend-line">
                              <span className="friend-name">{c.name}</span>
                            </span>
                            <span className="friend-line">
                              <span className="friend-preview">{c.members.length} people</span>
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {/* Group chat landed in Skype 5. Skype 3 and 4 could only
                      hold a one-to-one conversation, so the era themes for
                      those two don't offer a way to start a group. */}
                  {hasFeature(theme, 'group_chat') && (
                    <button type="button" className="new-group-btn" onClick={() => { setNewGroupOpen(true); setNewGroupName(''); setNewGroupMembers([]) }}>+ New group</button>
                  )}
                  </>
                  )}
                </div>
                {isClassicSkype(theme) && (
                  <div className="hub-side-bottom">
                    <button type="button" onClick={() => { setAddOpen(true); setAddFriend(''); setAddStatus(null) }}>Add a contact</button>
                    {/* Same Skype 5 cutoff as the modern "+ New group": the
                        classic strip is a different control for the same
                        feature, so it has to be gated the same way. */}
                    {hasFeature(theme, 'group_chat') && (
                      <button type="button" onClick={() => { setNewGroupOpen(true); setNewGroupName(''); setNewGroupMembers([]) }}>Create a group</button>
                    )}
                    <div className="online-strip">{Object.values(friends).filter((s) => s !== 'Offline').length} people online</div>
                  </div>
                )}
              </div>

              {/* ── Chat view ─────────────────────────────────────── */}
              <div className="hub-chat-view">
                {selectedConvo && !selected ? (
                  <GroupChat
                    name={convos.find((c) => c.id === selectedConvo)?.name ?? selectedConvo}
                    members={convos.find((c) => c.id === selectedConvo)?.members ?? []}
                    creator={convos.find((c) => c.id === selectedConvo)?.creator ?? ''}
                    me={me ?? ''}
                    friends={Object.keys(friends)}
                    lines={convoLogs[selectedConvo] ?? []}
                    renderBody={(t) => <RichText text={t} me={me} />}
                    senderColor={avatarColor}
                    onSend={(text) => {
                      send({ type: 'convo_msg', convo_id: selectedConvo, sender: me ?? undefined, body: text })
                      // Server fans out to the other members only — echo locally.
                      const cid = selectedConvo
                      setConvoLogs((prev) => ({
                        ...prev,
                        [cid]: [...(prev[cid] ?? []), {
                          id: `${cid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                          sender: me ?? '', body: text, ts: Date.now(), me: true,
                        }],
                      }))
                    }}
                    onLeave={() => {
                      send({ type: 'convo_leave', convo_id: selectedConvo, sender: me ?? undefined })
                      setConvos((prev) => prev.filter((c) => c.id !== selectedConvo))
                      setSelectedConvo(null)
                    }}
                    onClose={() => setSelectedConvo(null)}
                    onAddMembers={(usernames) => {
                      send({ type: 'convo_add_member', convo_id: selectedConvo, members: usernames })
                    }}
                    onRemoveMember={(username) => {
                      send({ type: 'convo_remove_member', convo_id: selectedConvo, recipient: username })
                    }}
                    onRename={(newName) => {
                      send({ type: 'convo_rename', convo_id: selectedConvo, convo_name: newName })
                    }}
                  />
                ) : (
                <section className="panel grow">
                  <div className="chat-header-bar">
                    {selected ? (
                      <>
                        <button type="button" className="chat-back-btn" onClick={() => setSelected(null)} title="Back to hub">
                          ← Back
                        </button>
                        <span className="avatar chat-peer-avatar" style={{ background: avatarColor(selected) }}>
                          {selected[0]?.toUpperCase()}
                          <AvatarImg user={selected} />
                          {isClassicSkype(theme)
                            ? <span className="avatar-presence"><PresenceIcon status={friends[selected] ?? 'Offline'} size={11} /></span>
                            : <span className="avatar-dot" style={{ background: statusColor(friends[selected] ?? 'Offline') }} />}
                        </span>
                        <span className="chat-peer-info">
                          <span className="chat-peer-name clickable" onClick={() => setProfileUser(selected)}>{selected}</span>
                          <span className="chat-peer-status">
                            {friends[selected] ?? 'Offline'}
                            {isClassicSkype(theme) && moods[selected] ? <span className="chat-peer-mood"> · {moods[selected]}</span> : null}
                          </span>
                        </span>
                        <div className="chat-call-btns">
                          <button
                            type="button"
                            className="chat-call-btn"
                            title={pinnedIds.length > 0 ? `${pinnedIds.length} pinned` : 'No pinned messages'}
                            onClick={() => setPinsOpen((v) => !v)}
                          >📌{pinnedIds.length > 0 ? <span className="header-count">{pinnedIds.length}</span> : null}</button>
                          <button
                            type="button"
                            className="chat-call-btn"
                            title="Search in this chat"
                            onClick={() => setSearchOpen((v) => !v)}
                          >🔍</button>
                          <button
                            type="button"
                            className="chat-call-btn"
                            title={selected && mutedPeers.has(selected) ? 'Unmute notifications' : 'Mute notifications'}
                            onClick={() => selected && togglePeerMute(selected)}
                          >{selected && mutedPeers.has(selected) ? '🔕' : '🔔'}</button>
                          <button
                            type="button"
                            className="chat-call-btn chat-call-btn-audio"
                            title="Audio call"
                            onClick={() => void startCall('audio')}
                            disabled={!me}
                          >☎</button>
                          <button
                            type="button"
                            className="chat-call-btn chat-call-btn-video"
                            title="Video call"
                            onClick={() => void startCall('video')}
                            disabled={!me}
                          >📹</button>
                          <button
                            type="button"
                            className="chat-call-btn"
                            title="Group call"
                            onClick={() => {
                              const room = `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
                              setGroupCallRoom(room)
                              if (selected) {
                                send({ type: 'call_invite', recipient: selected, channel_id: room })
                              }
                            }}
                            disabled={!me}
                          >👥</button>
                          <button
                            type="button"
                            className="chat-call-btn"
                            title={`Block ${selected}`}
                            onClick={() => {
                              if (selected && me && confirm(`Block ${selected}? They won't be able to message you.`)) {
                                send({ type: 'block', sender: me, recipient: selected })
                              }
                            }}
                          >🚫</button>
                          <button
                            type="button"
                            className="chat-call-btn"
                            title={`Report ${selected}`}
                            onClick={() => { setReportTarget(selected); setReportReason(''); setReportSent(false) }}
                          >⚑</button>
                        </div>
                      </>
                    ) : (
                      <span className="muted small">Select a friend to chat</span>
                    )}
                  </div>

                  {selected && searchOpen && (
                    <div className="search-bar">
                      <input
                        autoFocus
                        placeholder="Find in conversation…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Escape') { setSearchOpen(false); setSearch('') } }}
                      />
                      {search && (
                        <span className="muted small">{log.filter((l) => !l.deleted && l.text.toLowerCase().includes(search.toLowerCase())).length} matches</span>
                      )}
                      <button type="button" className="link-btn" onClick={() => { setSearch(''); setSearchOpen(false) }}>Close</button>
                    </div>
                  )}

                  {selected && pinsOpen && pinnedIds.length > 0 && (
                    <div className="pinned-strip">
                      <div className="pinned-title">📌 Pinned</div>
                      {log.filter((l) => pinnedIds.includes(l.id)).map((l) => (
                        <button
                          type="button"
                          key={l.id}
                          className="pinned-item"
                          onClick={() => { scrollToMessage(l.id) }}
                          title="Jump to message"
                        >
                          <span className="muted small">{l.from}:</span>{' '}
                          <span>{l.file ? `📎 ${l.file.name}` : (l.deleted ? '[deleted]' : l.text.slice(0, 80))}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="chat" ref={chatScrollRef}>
                    {!selected && (
                      <div className="chat-empty">
                        <div className="chat-empty-art">
                          <img src={faviconUrl} alt="" />
                        </div>
                        <h3>Stay in phase.</h3>
                        <p>
                          {Object.keys(friends).length === 0
                            ? 'Add a friend by username to get started — once they accept, your conversation appears here.'
                            : 'Pick someone from your friends list to start chatting.'}
                        </p>
                        <p className="chat-empty-hints">
                          <span><kbd>⌘K</kbd> quick switcher</span>
                          <span><kbd>/</kbd> commands</span>
                          <span><kbd>@</kbd> mention</span>
                        </p>
                      </div>
                    )}
                    {skypeHistory.length > 0 && (
                      <div className="skype-history-section">
                        <div className="skype-history-header">
                          <span className="skype-history-icon">💬</span>
                          <span>Import history · {skypeHistory.length} messages</span>
                        </div>
                        {skypeHistory.map((m, i) => {
                          const isMe = m.sender === me
                          return (
                            <div key={i} className={`bubble-row skype-hist ${isMe ? 'me' : ''}`}>
                              {!isMe && <span className="bubble-avatar" style={{ background: '#00AFF0', opacity: 0.7 }}>{m.sender[0]?.toUpperCase()}</span>}
                              <div className={`bubble skype-hist-bubble ${isMe ? 'me' : ''}`} title={m.sent_at}>
                                {!isMe && <span className="who">{m.sender}</span>}
                                <span className="bubble-text">{m.body}</span>
                                <span className="bubble-ts">{m.sent_at ? new Date(m.sent_at).toLocaleDateString() : ''}</span>
                              </div>
                            </div>
                          )
                        })}
                        <div className="skype-history-divider">— Phaze messages below —</div>
                      </div>
                    )}
                    {(() => {
                      const q = search.trim().toLowerCase()
                      const view = q ? log.filter((l) => !l.deleted && (l.text.toLowerCase().includes(q) || l.from.toLowerCase().includes(q))) : log
                      return view.map((line, i) => {
                      const prev = view[i - 1]
                      const showGap = !prev || (line.ts - prev.ts) > 5 * 60 * 1000 || prev.me !== line.me
                      const showDateSep = !prev || new Date(prev.ts).toDateString() !== new Date(line.ts).toDateString()
                      const isPinned = pinnedIds.includes(line.id)
                      const mentionsMe = !!me && containsMention(line.text, me)
                      return (
                        <React.Fragment key={line.id}>
                        {showDateSep && <div className="date-sep"><span>{dateSepLabel(line.ts)}</span></div>}
                        {line.callInfo ? (
                          <div className="call-line">
                            <span className={`call-line-icon ${line.callInfo.status}`}>📞</span>
                            {line.callInfo.status === 'missed'
                              ? `Missed ${line.callInfo.kind} call`
                              : `${line.callInfo.kind === 'video' ? 'Video' : 'Audio'} call · ${Math.floor(line.callInfo.duration / 60)}:${String(line.callInfo.duration % 60).padStart(2, '0')}`}
                          </div>
                        ) : (
                        <div data-msg-id={line.id} className={`bubble-row ${line.me ? 'me' : ''}`}>
                          {!line.me && showGap && (
                            <span className="bubble-avatar" style={{ background: avatarColor(line.from) }}>
                              {line.from[0]?.toUpperCase()}
                            </span>
                          )}
                          {!line.me && !showGap && <span className="bubble-avatar-spacer" />}
                          <div className={`bubble ${line.me ? 'me' : ''} ${line.deleted ? 'deleted' : ''} ${isPinned ? 'pinned' : ''} ${mentionsMe ? 'mentions-me' : ''}`} title={new Date(line.ts).toLocaleString()}>
                            {isClassicSkype(theme) && showGap && (
                              <div className="skype-msg-head">
                                <span className="who clickable" onClick={() => !line.me && setProfileUser(line.from)}>{line.me ? 'You' : line.from}</span>
                                <span className="skype-msg-head-ts">
                                  {formatTime(line.ts)}
                                  {hasFeature(theme, 'read_receipts') && line.me && <span className="receipt-tick" title={line.seen ? 'Seen' : 'Delivered'}>{line.seen ? ' ✓✓' : ' ✓'}</span>}
                                </span>
                              </div>
                            )}
                            {showGap && !line.me && <span className="who clickable" onClick={() => setProfileUser(line.from)}>{line.from}</span>}
                            {line.deleted ? (
                              <span className="bubble-text deleted-text">message deleted</span>
                            ) : line.file ? (
                              isImage(line.file.mime, line.file.name) ? (
                                <a href={line.file.url} target="_blank" rel="noopener noreferrer" className="bubble-image-link">
                                  <img src={line.file.url} alt={line.file.name} className="bubble-image" loading="lazy" />
                                </a>
                              ) : isVideo(line.file.mime, line.file.name) ? (
                                <video controls preload="metadata" src={line.file.url} className="bubble-video" />
                              ) : isAudio(line.file.mime, line.file.name) ? (
                                <div className="bubble-audio">
                                  <span className="bubble-audio-icon">🎙️</span>
                                  <audio controls preload="metadata" src={line.file.url} />
                                </div>
                              ) : (
                                <a href={line.file.url} target="_blank" rel="noopener noreferrer" className="bubble-file">
                                  <span className="bubble-file-icon">📎</span>
                                  <span className="bubble-file-meta">
                                    <span className="bubble-file-name">{line.file.name}</span>
                                    <span className="bubble-file-size">{fmtBytes(line.file.size)}</span>
                                  </span>
                                </a>
                              )
                            ) : (
                              <span className="bubble-text"><RichText text={line.text} me={me} />{line.edited && <span className="edited-tag"> (edited)</span>}</span>
                            )}
                            <span className="bubble-ts">{formatTime(line.ts)}{hasFeature(theme, 'read_receipts') && line.me && <span className="receipt-tick" title={line.seen ? 'Seen' : 'Delivered'}>{line.seen ? ' ✓✓' : ' ✓'}</span>}</span>
                            {/* Reactions arrived with Skype 8. A 2007 chat log
                                that sprouts emoji chips is the giveaway that
                                this is a modern app wearing a costume, so the
                                existing reactions are hidden along with the
                                ability to add one — the data is still there
                                and comes back when the era does. */}
                            {hasFeature(theme, 'reactions') && line.reactions && Object.keys(line.reactions).length > 0 && (
                              <div className="reactions">
                                {Object.entries(line.reactions).map(([e, users]) => (
                                  <button
                                    key={e}
                                    type="button"
                                    className={`react-chip ${me && users.includes(me) ? 'mine' : ''}`}
                                    onClick={() => reactTo(line, e)}
                                    title={users.join(', ')}
                                  >{e} {users.length}</button>
                                ))}
                              </div>
                            )}
                            {!line.deleted && (
                              <div className="bubble-actions">
                                {hasFeature(theme, 'reactions') && REACTION_EMOJIS.map((e) => (
                                  <button key={e} type="button" className="action-btn react" onClick={() => reactTo(line, e)} title={`React ${e}`}>{e}</button>
                                ))}
                                {hasFeature(theme, 'pinned_messages') && (
                                  <button type="button" className="action-btn" onClick={() => togglePin(line)} title={isPinned ? 'Unpin' : 'Pin'}>{isPinned ? '📍' : '📌'}</button>
                                )}
                                {/* Message editing shipped in Skype 3.2
                                    (2007), not Skype 8 — see
                                    docs/skype-eras/skype3.md. */}
                                {hasFeature(theme, 'edit_message') && line.me && !line.file && (
                                  <button type="button" className="action-btn" onClick={() => beginEdit(line)} title="Edit">✏️</button>
                                )}
                                {hasFeature(theme, 'delete_message') && line.me && (
                                  <button type="button" className="action-btn" onClick={() => deleteMessage(line)} title="Delete">🗑</button>
                                )}
                              </div>
                            )}
                            {hasFeature(theme, 'pinned_messages') && isPinned && <span className="pin-indicator" title="Pinned">📌</span>}
                          </div>
                        </div>
                        )}
                        </React.Fragment>
                      )
                    })
                    })()}
                    {selected && typingPeers.has(selected) && (
                      <div className="typing-indicator">
                        <span>{selected} is typing</span>
                        <span className="typing-dots"><span /><span /><span /></span>
                      </div>
                    )}
                  </div>

                  {selected && editingId && (
                    <div className="edit-banner">
                      <span>Editing message</span>
                      <button type="button" className="link-btn" onClick={cancelEdit}>Cancel</button>
                    </div>
                  )}

                  {selected && recording && (
                    <div className="edit-banner rec-banner">
                      <span><span className="rec-dot" /> Recording {fmtDuration(recDuration)} — press ⏹ to send, ✕ to cancel</span>
                    </div>
                  )}

                  {selected && (
                    <div className="row send">
                      <input
                        ref={fileInputRef}
                        type="file"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) void sendFile(f)
                          e.target.value = ''
                        }}
                      />
                      <button
                        type="button"
                        className="emoji-btn"
                        title="Attach file"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={!!editingId || recording}
                      >📎</button>
                      <button
                        type="button"
                        className={`emoji-btn mic-btn ${recording ? 'recording' : ''}`}
                        title={recording ? `Stop & send (${fmtDuration(recDuration)})` : 'Record voice message'}
                        onClick={() => void startRecording()}
                        disabled={!!editingId}
                      >{recording ? '⏹' : '🎙️'}</button>
                      {recording && (
                        <button
                          type="button"
                          className="emoji-btn"
                          title="Cancel"
                          onClick={() => stopRecording(true)}
                        >✕</button>
                      )}
                      <div className="emoji-wrap">
                        <button type="button" className="emoji-btn" title="Emoji" onClick={() => setEmojiOpen((v) => !v)}>😊</button>
                        {emojiOpen && (isClassicSkype(theme) ? (
                          <EmoticonPicker
                            onPick={(sc) => { setDraft((d) => d + sc + ' '); setEmojiOpen(false); draftInputRef.current?.focus() }}
                            onClose={() => setEmojiOpen(false)}
                          />
                        ) : (
                          <div className="emoji-picker" role="dialog" aria-label="Emoji picker">
                            {EMOJIS.map((e) => (
                              <button
                                key={e}
                                type="button"
                                className="emoji-cell"
                                onClick={() => { setDraft((d) => d + e); setEmojiOpen(false) }}
                              >{e}</button>
                            ))}
                          </div>
                        ))}
                      </div>
                      <div className="draft-wrap">
                        <input
                          ref={draftInputRef}
                          value={draft}
                          onChange={handleDraftChange}
                          onKeyDown={(e) => {
                            if (slashMatches.length > 0) {
                              if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIdx((i) => (i + 1) % slashMatches.length); return }
                              if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIdx((i) => (i - 1 + slashMatches.length) % slashMatches.length); return }
                              if (e.key === 'Tab') { e.preventDefault(); setDraft(slashMatches[slashIdx].cmd + ' '); setSlashIdx(0); return }
                            }
                            if (mentionMatches.length > 0 && mentionQuery !== null) {
                              if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx((i) => (i + 1) % mentionMatches.length); return }
                              if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx((i) => (i - 1 + mentionMatches.length) % mentionMatches.length); return }
                              if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); completeMention(mentionMatches[mentionIdx]); return }
                              if (e.key === 'Escape') { setMentionQuery(null); return }
                            }
                            if (e.key === 'Enter' && conn === 'open') sendChat()
                            else if (e.key === 'Escape' && editingId) cancelEdit()
                          }}
                          placeholder={editingId ? 'Edit message…' : (e2eReady ? 'Write a message… 🔒' : 'Write a message…')}
                        />
                        {slashMatches.length > 0 && (
                          <div className="mention-pop slash-pop" role="dialog" aria-label="Slash commands">
                            {slashMatches.map((c, i) => (
                              <button
                                key={c.cmd}
                                type="button"
                                className={`mention-row ${i === slashIdx ? 'on' : ''}`}
                                onMouseDown={(e) => { e.preventDefault(); setDraft(c.cmd + ' '); setSlashIdx(0); draftInputRef.current?.focus() }}
                                onMouseEnter={() => setSlashIdx(i)}
                              >
                                <span className="slash-cmd mono">{c.cmd}</span>
                                <span className="slash-desc">{c.desc}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {mentionMatches.length > 0 && mentionQuery !== null && (
                          <div className="mention-pop">
                            {mentionMatches.map((u, i) => (
                              <button
                                type="button"
                                key={u}
                                className={`mention-row ${i === mentionIdx ? 'on' : ''}`}
                                onMouseDown={(e) => { e.preventDefault(); completeMention(u) }}
                                onMouseEnter={() => setMentionIdx(i)}
                              >
                                <span className="avatar small" style={{ background: avatarColor(u) }}>{u[0]?.toUpperCase()}</span>
                                <span>{u}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button type="button" className={isClassicSkype(theme) && !editingId ? 'send-btn send-pill' : 'send-btn'} onClick={sendChat} disabled={conn !== 'open'} title={conn !== 'open' ? 'Reconnecting…' : undefined}>{editingId ? 'Save' : isClassicSkype(theme) ? 'Send message' : '▶'}</button>
                    </div>
                  )}
                </section>
                )}
              </div>
            </div>
          </main>
        )}
        </>
      )}

      <footer className="foot">
        <div className="foot-inner">
          <button
            type="button"
            className="foot-cta"
            onClick={() => setShowSupport(true)}
          >☕ Support Phaze</button>
          <div className="foot-links">
            <a href="https://twitter.com/PhazeChatWorld" target="_blank" rel="noopener noreferrer">Twitter</a>
            <span className="foot-dot" />
            <a href="https://instagram.com/phazechat.world" target="_blank" rel="noopener noreferrer">Instagram</a>
            <span className="foot-dot" />
            <a href="https://github.com/nickshouse/Phaze" target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
          <span className="foot-copy">Phaze</span>
        </div>
      </footer>
    </div>
    </OSChrome>
  )
}
