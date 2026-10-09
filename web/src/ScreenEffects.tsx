import { useEffect, useMemo } from 'react'

/** Full-screen reward effects. Played when a message containing an effect
 *  shortcode arrives from (or is sent by) someone who owns that effect.
 *  Pure CSS particles — no assets — and skipped entirely for people who
 *  asked their system for reduced motion. */
export type EffectId = 'fx-confetti' | 'fx-hearts' | 'fx-fireworks' | 'fx-aurora'

const DURATION: Record<EffectId, number> = {
  'fx-confetti': 3600, 'fx-hearts': 3600, 'fx-fireworks': 3200, 'fx-aurora': 4200,
}
const COLORS = ['#E86A6A', '#4FA3E0', '#7BD88F', '#FFC83D', '#A259FF', '#FF8FB1']

// Deterministic-per-mount pseudo random, so a render is stable.
function rng(seed: number) {
  let s = seed
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 }
}

export default function ScreenEffect({ kind, seed, onDone }: { kind: EffectId; seed: number; onDone: () => void }) {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    const t = setTimeout(onDone, reduced ? 0 : DURATION[kind])
    return () => clearTimeout(t)
  }, [kind, onDone, reduced])

  const parts = useMemo(() => {
    const r = rng(seed)
    if (kind === 'fx-confetti') {
      return Array.from({ length: 70 }, (_, i) => ({
        key: i, left: r() * 100, delay: r() * 0.9, dur: 2 + r() * 1.4, rot: 360 + r() * 720,
        size: 6 + r() * 6, color: COLORS[Math.floor(r() * COLORS.length)], drift: (r() - 0.5) * 160,
      }))
    }
    if (kind === 'fx-hearts') {
      return Array.from({ length: 26 }, (_, i) => ({
        key: i, left: r() * 100, delay: r() * 1.4, dur: 2.2 + r() * 1.4, size: 16 + r() * 22,
        drift: (r() - 0.5) * 120, color: ['#E8506A', '#FF7A92', '#FFA3B4'][Math.floor(r() * 3)],
      }))
    }
    if (kind === 'fx-fireworks') {
      return Array.from({ length: 5 }, (_, i) => ({
        key: i, left: 12 + r() * 76, top: 14 + r() * 38, delay: i * 0.45 + r() * 0.2,
        color: COLORS[Math.floor(r() * COLORS.length)],
      }))
    }
    return []
  }, [kind, seed])

  if (reduced) return null

  return (
    <div className={`screen-fx screen-fx-${kind}`} aria-hidden>
      {kind === 'fx-confetti' && (parts as { key: number; left: number; delay: number; dur: number; rot: number; size: number; color: string; drift: number }[]).map((p) => (
        <span key={p.key} className="fx-confetti-bit" style={{
          left: `${p.left}%`, width: p.size, height: p.size * 0.5, background: p.color,
          animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`,
          ['--rot' as string]: `${p.rot}deg`, ['--drift' as string]: `${p.drift}px`,
        }} />
      ))}
      {kind === 'fx-hearts' && (parts as { key: number; left: number; delay: number; dur: number; size: number; drift: number; color: string }[]).map((p) => (
        <span key={p.key} className="fx-heart" style={{
          left: `${p.left}%`, fontSize: p.size, color: p.color,
          animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, ['--drift' as string]: `${p.drift}px`,
        }}>♥</span>
      ))}
      {kind === 'fx-fireworks' && (parts as { key: number; left: number; top: number; delay: number; color: string }[]).map((p) => (
        <span key={p.key} className="fx-burst" style={{ left: `${p.left}%`, top: `${p.top}%`, animationDelay: `${p.delay}s` }}>
          {Array.from({ length: 18 }, (_, i) => (
            <i key={i} style={{ ['--a' as string]: `${i * 20}deg`, background: p.color, animationDelay: `${p.delay}s` }} />
          ))}
        </span>
      ))}
      {kind === 'fx-aurora' && (
        <>
          <span className="fx-aurora-band a" /><span className="fx-aurora-band b" /><span className="fx-aurora-band c" />
        </>
      )}
    </div>
  )
}
