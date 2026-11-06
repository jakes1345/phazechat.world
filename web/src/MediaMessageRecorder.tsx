import { useCallback, useEffect, useRef, useState } from 'react'
import './eraFeatures.css'

/** Records a voicemail (audio) or a video message and hands back a File.
 *
 *  Both are capped at three minutes, which is what the classic messenger
 *  allowed for each. Nothing is uploaded here — the caller sends the file
 *  through the normal attachment path, so it travels like any other file. */

export const MEDIA_MESSAGE_MAX_SECONDS = 180

type Mode = 'voicemail' | 'video_message'

type Props = {
  mode: Mode
  /** Who the message is for, shown in the title. */
  peer: string
  onSend: (file: File, durationSec: number) => void
  onClose: () => void
}

const AUDIO_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
const VIDEO_TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']

function pickType(candidates: string[]): string {
  if (typeof MediaRecorder === 'undefined') return ''
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
}

function extFor(mime: string, video: boolean): string {
  if (mime.includes('mp4')) return video ? 'mp4' : 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

function fmt(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

export default function MediaMessageRecorder({ mode, peer, onSend, onClose }: Props) {
  const video = mode === 'video_message'
  const [phase, setPhase] = useState<'starting' | 'ready' | 'recording' | 'review' | 'error'>('starting')
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<{ file: File; url: string; duration: number } | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedRef = useRef(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const previewRef = useRef<HTMLVideoElement | null>(null)

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    let cancelled = false
    navigator.mediaDevices.getUserMedia(video ? { audio: true, video: { width: 640, height: 480 } } : { audio: true })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        if (previewRef.current) {
          previewRef.current.srcObject = stream
          void previewRef.current.play().catch(() => {})
        }
        setPhase('ready')
      })
      .catch(() => {
        if (cancelled) return
        setError(video ? 'Camera or microphone access was denied.' : 'Microphone access was denied.')
        setPhase('error')
      })
    return () => {
      cancelled = true
      if (tickRef.current) clearInterval(tickRef.current)
      try { recRef.current?.stop() } catch { /* already stopped */ }
      stopTracks()
    }
  }, [video, stopTracks])

  // Revoke the review URL when it's replaced or the dialog closes.
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url) }, [result])

  const stop = useCallback(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
    try { recRef.current?.stop() } catch { /* already stopped */ }
  }, [])

  const start = useCallback(() => {
    const stream = streamRef.current
    if (!stream) return
    const mime = pickType(video ? VIDEO_TYPES : AUDIO_TYPES)
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
    recRef.current = rec
    chunksRef.current = []
    rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data) }
    rec.onstop = () => {
      const type = rec.mimeType || (video ? 'video/webm' : 'audio/webm')
      const duration = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000))
      const blob = new Blob(chunksRef.current, { type })
      chunksRef.current = []
      const base = video ? 'video-message' : 'voicemail'
      const file = new File([blob], `${base}-${Date.now()}-${duration}s.${extFor(type, video)}`, { type })
      setResult({ file, url: URL.createObjectURL(blob), duration })
      setPhase('review')
      stopTracks()
    }
    startedRef.current = Date.now()
    setElapsed(0)
    rec.start(1000)
    setPhase('recording')
    tickRef.current = setInterval(() => {
      const s = Math.floor((Date.now() - startedRef.current) / 1000)
      setElapsed(s)
      if (s >= MEDIA_MESSAGE_MAX_SECONDS) stop()
    }, 250)
  }, [video, stop, stopTracks])

  const title = video ? `Video message to ${peer}` : `Voicemail for ${peer}`

  return (
    <div className="era-modal-backdrop" role="dialog" aria-label={title} onClick={onClose}>
      <div className="era-modal media-recorder" onClick={(e) => e.stopPropagation()}>
        <div className="era-modal-title">{title}</div>
        {video && phase !== 'review' && (
          <video ref={previewRef} className="media-recorder-preview" muted playsInline />
        )}
        {phase === 'review' && result && (
          video
            ? <video className="media-recorder-preview" src={result.url} controls playsInline />
            : <audio className="media-recorder-audio" src={result.url} controls />
        )}
        {!video && phase !== 'review' && (
          <div className={`media-recorder-meter ${phase === 'recording' ? 'on' : ''}`}>
            <span className="rec-dot" />
          </div>
        )}
        <div className="media-recorder-status">
          {phase === 'starting' && (video ? 'Starting camera…' : 'Starting microphone…')}
          {phase === 'ready' && `Up to ${fmt(MEDIA_MESSAGE_MAX_SECONDS)}. Press record when you're ready.`}
          {phase === 'recording' && `Recording ${fmt(elapsed)} / ${fmt(MEDIA_MESSAGE_MAX_SECONDS)}`}
          {phase === 'review' && result && `${fmt(result.duration)} recorded`}
          {phase === 'error' && error}
        </div>
        <div className="era-modal-actions">
          {phase === 'ready' && <button type="button" className="era-btn primary" onClick={start}>● Record</button>}
          {phase === 'recording' && <button type="button" className="era-btn primary" onClick={stop}>■ Stop</button>}
          {phase === 'review' && result && (
            <>
              <button type="button" className="era-btn primary" onClick={() => onSend(result.file, result.duration)}>Send</button>
              <button type="button" className="era-btn" onClick={() => { onClose() }}>Discard</button>
            </>
          )}
          {phase !== 'review' && <button type="button" className="era-btn" onClick={onClose}>Cancel</button>}
        </div>
      </div>
    </div>
  )
}
