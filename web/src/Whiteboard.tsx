import { useCallback, useEffect, useRef, useState } from 'react'
import type { NexusMessage } from './nexusTypes'
import './whiteboard.css'

/**
 * Shared whiteboard.
 *
 * Modelled on the one in Skype for Business — the only place the Skype family
 * ever shipped a collaborative drawing surface. Consumer Skype never had one.
 * See docs/skype-era-research.md.
 *
 * Two design points worth stating, because they're where the bodies are
 * buried:
 *
 * 1. Coordinates are normalised to 0..1 rather than pixels. Two people on a
 *    laptop and a phone have very different canvases, and storing pixels
 *    would mean a line drawn through the middle of one board lands in the
 *    corner of the other. Everything converts at paint time.
 *
 * 2. The canvas is redrawn from the stroke list rather than being the source
 *    of truth. It costs a full replay on every change, but it means resizing,
 *    undo and a late joiner replaying history all go through one code path
 *    instead of three — and a canvas you can't reconstruct is a canvas that
 *    silently diverges between clients.
 */

export type WbTool = 'pen' | 'highlighter' | 'eraser'

export interface WbStroke {
  id: string
  tool: WbTool
  color: string
  width: number
  /** Normalised 0..1 so the board scales across different screens. */
  points: [number, number][]
}

interface Props {
  me: string
  channelId: string
  channelName: string
  /** True when the viewer can clear the whole board (space owner/admin). */
  canClear: boolean
  send: (m: NexusMessage) => void
  subscribe: (handler: (m: NexusMessage) => void) => () => void
}

const COLORS = ['#1a1a1a', '#d0021b', '#0078d4', '#0a9a4a', '#e6920a', '#8b3fd1']
const WIDTHS: Record<WbTool, number> = { pen: 3, highlighter: 16, eraser: 24 }

export default function Whiteboard({ me, channelId, channelName, canClear, send, subscribe }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Committed strokes, plus the one currently under the pointer. The live one
  // is kept separate so it can be drawn every frame without being appended to
  // history until the pointer lifts.
  const strokesRef = useRef<WbStroke[]>([])
  const liveRef = useRef<WbStroke | null>(null)
  const drawingRef = useRef(false)
  // Ids of strokes this connection drew and already painted locally.
  //
  // Echo suppression has to key on the stroke, not the author. Keying on
  // author looks right until the same person opens the board on a second
  // device: both connections report the same username, so each would discard
  // the other's strokes as its own echo and the two boards would silently
  // diverge.
  const ownStrokeIdsRef = useRef<Set<string>>(new Set())

  const [tool, setTool] = useState<WbTool>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Painting ──────────────────────────────────────────────────────────
  const paint = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    const drawStroke = (s: WbStroke) => {
      if (s.points.length === 0) return
      ctx.save()
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      // Eraser paints with destination-out so it removes pixels rather than
      // covering them — otherwise it would only work on a white background
      // and leave visible smears over anything else.
      if (s.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out'
        ctx.strokeStyle = 'rgba(0,0,0,1)'
      } else {
        ctx.globalCompositeOperation = 'source-over'
        ctx.strokeStyle = s.color
        if (s.tool === 'highlighter') ctx.globalAlpha = 0.35
      }
      // Width is scaled off the canvas so a 3px pen looks the same relative
      // size on every screen.
      ctx.lineWidth = (s.width / 1000) * width

      ctx.beginPath()
      const [x0, y0] = s.points[0]
      ctx.moveTo(x0 * width, y0 * height)
      if (s.points.length === 1) {
        // A tap with no movement still deserves a dot.
        ctx.lineTo(x0 * width + 0.01, y0 * height + 0.01)
      } else {
        for (let i = 1; i < s.points.length; i++) {
          const [x, y] = s.points[i]
          ctx.lineTo(x * width, y * height)
        }
      }
      ctx.stroke()
      ctx.restore()
    }

    for (const s of strokesRef.current) drawStroke(s)
    if (liveRef.current) drawStroke(liveRef.current)
  }, [])

  // ── Canvas sizing ─────────────────────────────────────────────────────
  // Backing store is sized to the device pixel ratio so lines aren't blurry
  // on high-DPI screens, then everything repaints from normalised points.
  const resize = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const dpr = window.devicePixelRatio || 1
    const rect = wrap.getBoundingClientRect()
    canvas.width = Math.max(1, Math.round(rect.width * dpr))
    canvas.height = Math.max(1, Math.round(rect.height * dpr))
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    paint()
  }, [paint])

  useEffect(() => {
    resize()
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => resize())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [resize])

  // ── Server sync ───────────────────────────────────────────────────────
  useEffect(() => {
    strokesRef.current = []
    liveRef.current = null
    ownStrokeIdsRef.current.clear()
    setReady(false)
    paint()
    send({ type: 'wb_join', channel_id: channelId })

    const unsub = subscribe((m) => {
      if (m.channel_id && m.channel_id !== channelId) return
      switch (m.type) {
        case 'wb_state': {
          if (m.error) { setError(m.error); return }
          const parsed: WbStroke[] = []
          for (const raw of m.strokes ?? []) {
            try { parsed.push(JSON.parse(raw) as WbStroke) } catch { /* skip */ }
          }
          strokesRef.current = parsed
          setReady(true)
          paint()
          break
        }
        case 'wb_stroke': {
          if (!m.stroke) break
          try {
            const incoming = JSON.parse(m.stroke) as WbStroke
            // Skip only the echo of a stroke *this connection* drew — it's
            // already on screen, and re-adding it would double the ink and
            // darken overlapping highlighter marks.
            if (ownStrokeIdsRef.current.has(incoming.id)) break
            strokesRef.current = [...strokesRef.current, incoming]
            paint()
          } catch { /* ignore malformed */ }
          break
        }
        case 'wb_undo': {
          // The server names the stroke it removed, so drop exactly that one
          // rather than guessing — guessing removes someone else's mark when
          // several people are drawing at once.
          if (!m.stroke_uid) break
          ownStrokeIdsRef.current.delete(m.stroke_uid)
          strokesRef.current = strokesRef.current.filter((st) => st.id !== m.stroke_uid)
          paint()
          break
        }
        case 'wb_clear': {
          strokesRef.current = []
          liveRef.current = null
          ownStrokeIdsRef.current.clear()
          paint()
          break
        }
        case 'wb_error':
          if (m.error) setError(m.error)
          break
      }
    })
    return unsub
  }, [channelId, me, send, subscribe, paint])

  // ── Pointer handling ──────────────────────────────────────────────────
  const pointFrom = (e: React.PointerEvent): [number, number] => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return [
      Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    ]
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!ready) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = true
    liveRef.current = {
      id: `${me}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tool,
      color,
      width: WIDTHS[tool],
      points: [pointFrom(e)],
    }
    paint()
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current || !liveRef.current) return
    const [x, y] = pointFrom(e)
    const pts = liveRef.current.points
    const last = pts[pts.length - 1]
    // Drop points that barely moved. Without this a slow drag generates
    // hundreds of near-identical coordinates, which bloats the payload and
    // can trip the server's per-stroke point cap on a single scribble.
    if (last && Math.abs(last[0] - x) < 0.002 && Math.abs(last[1] - y) < 0.002) return
    pts.push([x, y])
    paint()
  }

  const finishStroke = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    const stroke = liveRef.current
    liveRef.current = null
    if (!stroke || stroke.points.length === 0) { paint(); return }
    // Commit locally first so the line doesn't flicker while the round trip
    // completes, then tell everyone else.
    strokesRef.current = [...strokesRef.current, stroke]
    ownStrokeIdsRef.current.add(stroke.id)
    paint()
    send({ type: 'wb_stroke', channel_id: channelId, stroke: JSON.stringify(stroke) })
  }

  const undo = () => {
    // Take back the last stroke *this connection* drew, and tell the server
    // which one. Scoping by username instead would let one device undo a mark
    // made on another device of the same account — two tabs would fight.
    const mine = [...strokesRef.current]
    for (let i = mine.length - 1; i >= 0; i--) {
      if (ownStrokeIdsRef.current.has(mine[i].id)) {
        const uid = mine[i].id
        ownStrokeIdsRef.current.delete(uid)
        mine.splice(i, 1)
        strokesRef.current = mine
        paint()
        send({ type: 'wb_undo', channel_id: channelId, stroke_uid: uid })
        return
      }
    }
    // Nothing of ours left to undo on this device.
  }

  return (
    <section className="wb">
      <header className="wb-bar">
        <span className="wb-title">✏️ {channelName}</span>

        <div className="wb-tools" role="toolbar" aria-label="Drawing tools">
          {(['pen', 'highlighter', 'eraser'] as WbTool[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`wb-tool ${tool === t ? 'on' : ''}`}
              onClick={() => setTool(t)}
              title={t[0].toUpperCase() + t.slice(1)}
            >{t === 'pen' ? '🖊' : t === 'highlighter' ? '🖍' : '🧽'}</button>
          ))}
        </div>

        <div className="wb-colors" role="toolbar" aria-label="Colours">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`wb-color ${color === c && tool !== 'eraser' ? 'on' : ''}`}
              style={{ background: c }}
              onClick={() => { setColor(c); if (tool === 'eraser') setTool('pen') }}
              aria-label={`Colour ${c}`}
            />
          ))}
        </div>

        <div className="wb-actions">
          <button type="button" className="wb-btn" onClick={undo}>Undo</button>
          {canClear && (
            <button
              type="button"
              className="wb-btn wb-btn-danger"
              onClick={() => {
                if (confirm('Clear the board for everyone? This cannot be undone.')) {
                  send({ type: 'wb_clear', channel_id: channelId })
                }
              }}
            >Clear</button>
          )}
        </div>
      </header>

      {error && <div className="wb-error">{error}</div>}

      <div className="wb-surface" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className={`wb-canvas ${tool}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onPointerLeave={finishStroke}
        />
        {!ready && <div className="wb-loading">Loading board…</div>}
      </div>
    </section>
  )
}
