/** Records a call the way it looks and sounds on this screen.
 *
 *  Calls run inside a cross-origin iframe, so there is no access to the
 *  remote media streams. Instead this captures the current tab (picture and
 *  the call audio playing in it) and mixes in the local microphone, which is
 *  what the other side hears from us. The browser asks the person to
 *  confirm the capture, as it should. */

export type CallRecording = {
  stop: () => Promise<{ file: File; duration: number }>
  /** Throw away the recording without producing a file. */
  cancel: () => void
}

const TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']

export async function startCallRecording(peer: string): Promise<CallRecording> {
  const display = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true,
    // Chromium hints: offer this tab first and keep its audio playing.
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
  } as DisplayMediaStreamOptions)

  let mic: MediaStream | null = null
  try {
    mic = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    mic = null // record without our own voice rather than not at all
  }

  const ctx = new AudioContext()
  const dest = ctx.createMediaStreamDestination()
  if (display.getAudioTracks().length > 0) ctx.createMediaStreamSource(display).connect(dest)
  if (mic) ctx.createMediaStreamSource(mic).connect(dest)

  const mixed = new MediaStream([...display.getVideoTracks(), ...dest.stream.getAudioTracks()])
  const mime = TYPES.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) ?? ''
  // Modest bitrates so a few minutes of call fit the 25 MB attachment cap.
  const bitrates = { videoBitsPerSecond: 600_000, audioBitsPerSecond: 64_000 }
  const rec = new MediaRecorder(mixed, mime ? { mimeType: mime, ...bitrates } : bitrates)
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data) }
  const started = Date.now()

  const release = () => {
    display.getTracks().forEach((t) => t.stop())
    mic?.getTracks().forEach((t) => t.stop())
    void ctx.close().catch(() => {})
  }

  const stopped = new Promise<void>((resolve) => { rec.onstop = () => resolve() })
  rec.start(1000)

  // Ending the capture from the browser's own "Stop sharing" bar ends the
  // recording too.
  display.getVideoTracks()[0]?.addEventListener('ended', () => { if (rec.state !== 'inactive') rec.stop() })

  return {
    stop: async () => {
      if (rec.state !== 'inactive') rec.stop()
      await stopped
      release()
      const type = rec.mimeType || 'video/webm'
      const secs = Math.max(1, Math.round((Date.now() - started) / 1000))
      const safePeer = peer.replace(/[^A-Za-z0-9_-]/g, '')
      const ext = type.includes('mp4') ? 'mp4' : 'webm'
      const file = new File([new Blob(chunks, { type })], `call-recording-${safePeer}-${Date.now()}-${secs}s.${ext}`, { type })
      return { file, duration: secs }
    },
    cancel: () => {
      rec.ondataavailable = null
      if (rec.state !== 'inactive') rec.stop()
      release()
    },
  }
}
