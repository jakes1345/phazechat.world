import { useContext, type ReactNode } from 'react'
import { EMOTICONS } from './emoticons'
import { SenderItemsContext, rewardById } from './referralRewards'

const glyphs = new Map<string, string>(EMOTICONS.map((e) => [e.id, e.emoji]))

// House style: 20×20 canvas, warm yellow face (#FFD764) with a darker rim
// (#B98A00), features in #5B4300. Every piece is drawn by hand here — no
// third-party art ships with the app.
function Face({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={`emo ${className}`}>
      <circle cx="10" cy="10" r="9" fill="#FFD764" stroke="#B98A00" strokeWidth="1" />
      {children}
    </svg>
  )
}

function Eyes({ y = 8 }: { y?: number }) {
  return (
    <>
      <circle cx="6.8" cy={y} r="1.2" fill="#5B4300" />
      <circle cx="13.2" cy={y} r="1.2" fill="#5B4300" />
    </>
  )
}

const Smile = () => (
  <Face className="emo-anim-bounce">
    <Eyes />
    <path d="M6 12.2c1.2 1.8 2.6 2.6 4 2.6s2.8-.8 4-2.6" stroke="#5B4300" strokeWidth="1.4" fill="none" strokeLinecap="round" />
  </Face>
)

const Laugh = () => (
  <Face className="emo-anim-bounce-fast">
    <path d="M5.4 7.6l2.8 1M14.6 7.6l-2.8 1" stroke="#5B4300" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M5.8 11.5h8.4c-.5 2.6-2.1 4-4.2 4s-3.7-1.4-4.2-4z" fill="#5B4300" />
    <path d="M7.4 14.6c.8.6 1.7.9 2.6.9s1.8-.3 2.6-.9c-.7-1-1.6-1.5-2.6-1.5s-1.9.5-2.6 1.5z" fill="#E86A6A" />
  </Face>
)

const Wink = () => (
  <Face>
    <circle cx="6.8" cy="8" r="1.2" fill="#5B4300" />
    <g className="emo-wink-eye"><rect x="11.7" y="7.4" width="3" height="1.4" rx="0.7" fill="#5B4300" /></g>
    <path d="M6 12.4c1.2 1.6 2.6 2.4 4 2.4s2.8-.8 4-2.4" stroke="#5B4300" strokeWidth="1.4" fill="none" strokeLinecap="round" />
  </Face>
)

const Sad = () => (
  <Face className="emo-anim-droop">
    <Eyes />
    <path d="M6.4 14.6c1.1-1.6 2.3-2.3 3.6-2.3s2.5.7 3.6 2.3" stroke="#5B4300" strokeWidth="1.4" fill="none" strokeLinecap="round" />
  </Face>
)

const Cry = () => (
  <Face>
    <Eyes />
    <path d="M6.4 14.8c1.1-1.5 2.3-2.2 3.6-2.2s2.5.7 3.6 2.2" stroke="#5B4300" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    <path className="emo-tear" d="M6.6 9.4c.9 0 1.4.7 1.4 1.5 0 .8-.6 1.4-1.4 1.4s-1.4-.6-1.4-1.4c0-.8.5-1.5 1.4-1.5z" fill="#6FB9E8" />
  </Face>
)

const Wave = () => (
  <svg viewBox="0 0 20 20" className="emo">
    <circle cx="9" cy="10" r="8" fill="#FFD764" stroke="#B98A00" strokeWidth="1" />
    <circle cx="6.4" cy="8.4" r="1.1" fill="#5B4300" />
    <circle cx="11.6" cy="8.4" r="1.1" fill="#5B4300" />
    <path d="M6 12.6c1 1.4 2.2 2 3 2s2-.6 3-2" stroke="#5B4300" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    <g className="emo-hand">
      <path d="M15.5 6.5c.8-.4 1.8-.2 2.2.6.4.8.1 1.7-.7 2.2l-1.8 1-1.4-2.6z" fill="#FFD764" stroke="#B98A00" strokeWidth="0.8" />
    </g>
  </svg>
)

const Heart = () => (
  <svg viewBox="0 0 20 20" className="emo emo-anim-pulse">
    <path d="M10 17.2L3.6 10.8C1.9 9.1 1.9 6.4 3.6 4.7c1.7-1.7 4.4-1.7 6.1 0l.3.3.3-.3c1.7-1.7 4.4-1.7 6.1 0 1.7 1.7 1.7 4.4 0 6.1L10 17.2z" fill="#E4141B" />
  </svg>
)

const Kiss = () => (
  <Face>
    <Eyes />
    <path d="M9 12.6c1.2-.5 2.2-.5 3 0-.8.9-1.3 1.3-1.5 1.3s-.7-.4-1.5-1.3z" fill="#E86A6A" />
    <path className="emo-float" d="M14.6 10.6l-1-1c-.3-.3-.3-.7 0-1 .3-.3.7-.3 1 0 .3-.3.7-.3 1 0 .3.3.3.7 0 1l-1 1z" fill="#E4141B" />
  </Face>
)

const Cool = () => (
  <Face className="emo-anim-bounce">
    <path d="M4.4 7.4h11.2l-.5 2.4c-.2 1.1-1 1.7-2.1 1.7h-1.2c-1 0-1.8-.6-2-1.6l-.1-.6h-.4l-.1.6c-.2 1-1 1.6-2 1.6H6.9c-1 0-1.9-.6-2.1-1.7l-.4-2.4z" fill="#2B2B30" />
    <path d="M6.6 13.8c1.1 1 2.3 1.5 3.4 1.5s2.3-.5 3.4-1.5" stroke="#5B4300" strokeWidth="1.3" fill="none" strokeLinecap="round" />
  </Face>
)

const Angry = () => (
  <svg viewBox="0 0 20 20" className="emo emo-anim-shake">
    <circle cx="10" cy="10" r="9" fill="#E86A4A" stroke="#9C3D22" strokeWidth="1" />
    <path d="M5 6.8l3.2 1.4M15 6.8l-3.2 1.4" stroke="#5B1A00" strokeWidth="1.3" strokeLinecap="round" />
    <circle cx="7" cy="9.6" r="1.1" fill="#5B1A00" />
    <circle cx="13" cy="9.6" r="1.1" fill="#5B1A00" />
    <path d="M6.6 14.4c1.1-1.2 2.3-1.8 3.4-1.8s2.3.6 3.4 1.8" stroke="#5B1A00" strokeWidth="1.3" fill="none" strokeLinecap="round" />
  </svg>
)

const Surprised = () => (
  <Face className="emo-anim-pop">
    <Eyes y={7.4} />
    <ellipse cx="10" cy="13" rx="2" ry="2.6" fill="#5B4300" />
  </Face>
)

const Blush = () => (
  <Face>
    <Eyes />
    <circle className="emo-cheek" cx="4.9" cy="11.2" r="1.5" fill="#F2A3A3" />
    <circle className="emo-cheek" cx="15.1" cy="11.2" r="1.5" fill="#F2A3A3" />
    <path d="M7 13.4c1 1 2 1.5 3 1.5s2-.5 3-1.5" stroke="#5B4300" strokeWidth="1.3" fill="none" strokeLinecap="round" />
  </Face>
)

const Tongue = () => (
  <Face>
    <Eyes />
    <path d="M5.8 11.6c1.3 1 2.7 1.5 4.2 1.5s2.9-.5 4.2-1.5" stroke="#5B4300" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    <g className="emo-tongue">
      <path d="M9 12.8h3.4v1.6c0 1-.7 1.8-1.7 1.8s-1.7-.8-1.7-1.8v-1.6z" fill="#E86A6A" stroke="#C64A4A" strokeWidth="0.6" />
    </g>
  </Face>
)

const Sweat = () => (
  <Face>
    <path d="M5.4 8.2l2.8-.6M14.6 8.2l-2.8-.6" stroke="#5B4300" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M6.6 13.6h6.8" stroke="#5B4300" strokeWidth="1.3" strokeLinecap="round" />
    <path className="emo-drop" d="M15.6 4.6c1 1.3 1.5 2.3 1.5 3.1 0 .9-.7 1.6-1.5 1.6s-1.5-.7-1.5-1.6c0-.8.5-1.8 1.5-3.1z" fill="#6FB9E8" />
  </Face>
)

const Party = () => (
  <svg viewBox="0 0 20 20" className="emo">
    <circle cx="10" cy="11" r="8" fill="#FFD764" stroke="#B98A00" strokeWidth="1" />
    <circle cx="7.2" cy="9.8" r="1.1" fill="#5B4300" />
    <circle cx="12.8" cy="9.8" r="1.1" fill="#5B4300" />
    <path d="M6.6 13.2c1 1.3 2.2 2 3.4 2s2.4-.7 3.4-2" stroke="#5B4300" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    <path d="M8.6 3.6L12 1l.4 4.2z" fill="#0095CC" />
    <g className="emo-confetti">
      <circle cx="3.4" cy="3.4" r="0.8" fill="#E4141B" />
      <circle cx="16.6" cy="2.8" r="0.8" fill="#7BA700" />
      <circle cx="17.6" cy="6" r="0.7" fill="#FCAF17" />
    </g>
  </svg>
)

const Sleepy = () => (
  <Face>
    <path d="M5.6 8.6h2.6M11.8 8.6h2.6" stroke="#5B4300" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M7.4 13.6c.9.7 1.7 1 2.6 1s1.7-.3 2.6-1" stroke="#5B4300" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    <path className="emo-zzz" d="M13.4 3.2h3l-3 3h3" stroke="#5B7DA0" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </Face>
)

const Think = () => (
  <Face>
    <g className="emo-eyes-shift"><Eyes y={7.8} /></g>
    <path d="M5.2 5.6l3-1" stroke="#5B4300" strokeWidth="1.1" strokeLinecap="round" />
    <path d="M7.6 13.8c.8-.5 1.6-.7 2.4-.7" stroke="#5B4300" strokeWidth="1.3" fill="none" strokeLinecap="round" />
  </Face>
)

const Yes = () => (
  <svg viewBox="0 0 20 20" className="emo emo-anim-bounce">
    <path d="M3 9.5h3v8H3z" fill="#FFD764" stroke="#B98A00" strokeWidth="0.8" />
    <path d="M6 10.5l3.4-5.4c.3-.5.8-.7 1.3-.6.8.2 1.2.9 1 1.7l-.7 3h4.2c.9 0 1.6.8 1.4 1.7l-1.1 5c-.2.9-.9 1.6-1.9 1.6H6v-7z" fill="#FFD764" stroke="#B98A00" strokeWidth="0.8" />
  </svg>
)

const No = () => (
  <svg viewBox="0 0 20 20" className="emo emo-anim-bounce">
    <g transform="rotate(180 10 10)">
      <path d="M3 9.5h3v8H3z" fill="#FFD764" stroke="#B98A00" strokeWidth="0.8" />
      <path d="M6 10.5l3.4-5.4c.3-.5.8-.7 1.3-.6.8.2 1.2.9 1 1.7l-.7 3h4.2c.9 0 1.6.8 1.4 1.7l-1.1 5c-.2.9-.9 1.6-1.9 1.6H6v-7z" fill="#FFD764" stroke="#B98A00" strokeWidth="0.8" />
    </g>
  </svg>
)

const Hug = () => (
  <svg viewBox="0 0 20 20" className="emo">
    <circle cx="10" cy="9" r="7" fill="#FFD764" stroke="#B98A00" strokeWidth="1" />
    <circle cx="7.6" cy="7.8" r="1" fill="#5B4300" />
    <circle cx="12.4" cy="7.8" r="1" fill="#5B4300" />
    <path d="M7.2 11c.9.9 1.8 1.3 2.8 1.3s1.9-.4 2.8-1.3" stroke="#5B4300" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    <g className="emo-arms">
      <path d="M2.2 12.5c1.2 2.6 3 4.2 5.3 4.9M17.8 12.5c-1.2 2.6-3 4.2-5.3 4.9" stroke="#B98A00" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </g>
  </svg>
)

// ── Referral rewards (referralRewards.ts) — same house style, also
// drawn here from scratch. ──────────────────────────────────────────────

const MiniFace = ({ cx, cy, r }: { cx: number; cy: number; r: number }) => (
  <g>
    <circle cx={cx} cy={cy} r={r} fill="#FFD764" stroke="#B98A00" strokeWidth="0.9" />
    <circle cx={cx - r * 0.35} cy={cy - r * 0.2} r={r * 0.14} fill="#5B4300" />
    <circle cx={cx + r * 0.35} cy={cy - r * 0.2} r={r * 0.14} fill="#5B4300" />
    <path d={`M${cx - r * 0.45} ${cy + r * 0.25}q${r * 0.45} ${r * 0.45} ${r * 0.9} 0`} stroke="#5B4300" strokeWidth="1" fill="none" strokeLinecap="round" />
  </g>
)

const Squad = () => (
  <svg viewBox="0 0 20 20" className="emo emo-anim-bounce">
    <MiniFace cx={6.6} cy={9.4} r={5.6} />
    <MiniFace cx={13.4} cy={11} r={5.8} />
  </svg>
)

const Glass = ({ x, rot }: { x: number; rot: number }) => (
  <g transform={`rotate(${rot} ${x} 17)`}>
    <path d={`M${x - 3} 4.5h6l-1 9.5h-4z`} fill="#FFF6D6" stroke="#B98A00" strokeWidth="0.8" strokeLinejoin="round" />
    <path d={`M${x - 2.6} 8h5.2l-.62 6h-3.96z`} fill="#F2B33D" />
    <circle cx={x - 0.6} cy={10.5} r={0.5} fill="#FFF6D6" />
    <path d={`M${x - 2} 17.6h4`} stroke="#B98A00" strokeWidth="1" strokeLinecap="round" />
    <path d={`M${x} 14v3.6`} stroke="#B98A00" strokeWidth="0.8" />
  </g>
)

const Cheers = () => (
  <svg viewBox="0 0 20 20" className="emo">
    <Glass x={6.4} rot={-14} />
    <Glass x={13.6} rot={14} />
    <g className="emo-anim-pulse">
      <path d="M10 .8l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5z" fill="#FFC83D" />
    </g>
  </svg>
)

const Crown = () => (
  <svg viewBox="0 0 20 20" className="emo emo-anim-bounce">
    <circle cx="10" cy="12.2" r="7.2" fill="#FFD764" stroke="#B98A00" strokeWidth="1" />
    <circle cx="7.4" cy="11.4" r="1.1" fill="#5B4300" />
    <circle cx="12.6" cy="11.4" r="1.1" fill="#5B4300" />
    <path d="M7 14.4c.9 1.2 1.9 1.7 3 1.7s2.1-.5 3-1.7" stroke="#5B4300" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    <path d="M4.6 6.6L5.4 1.8l2.6 2.6L10 .8l2 3.6 2.6-2.6.8 4.8z" fill="#FFC83D" stroke="#B98A00" strokeWidth="0.8" strokeLinejoin="round" />
    <circle cx="10" cy="4.8" r="0.8" fill="#E86A6A" />
  </svg>
)

const Rocket = () => (
  <svg viewBox="0 0 20 20" className="emo emo-anim-shake">
    <g transform="rotate(45 10 10)">
      <path d="M8.6 15.2l1.4 3.6 1.4-3.6z" fill="#FFB13D" />
      <path d="M10 1.2c2.4 2 3.2 5 3.2 8.4v5.6H6.8V9.6c0-3.4.8-6.4 3.2-8.4z" fill="#EEF2F7" stroke="#6B7A90" strokeWidth="0.8" />
      <circle cx="10" cy="7.6" r="1.6" fill="#4FA3E0" stroke="#6B7A90" strokeWidth="0.6" />
      <path d="M6.8 11.4l-2.4 2.8v1.6l2.4-.6zM13.2 11.4l2.4 2.8v1.6l-2.4-.6z" fill="#E86A6A" />
    </g>
  </svg>
)

const Legend = () => (
  <svg viewBox="0 0 20 20" className="emo">
    <circle cx="10" cy="10.6" r="7.6" fill="#FFD23F" stroke="#C98F00" strokeWidth="1" />
    <path d="M4.4 8.6h11.2" stroke="#1E1E1E" strokeWidth="0.9" />
    <rect x="4.6" y="8.2" width="4.4" height="2.8" rx="1.2" fill="#1E1E1E" />
    <rect x="11" y="8.2" width="4.4" height="2.8" rx="1.2" fill="#1E1E1E" />
    <path d="M7.2 14c1.4.9 3.6 1 5.4-.4" stroke="#5B4300" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    <g className="emo-anim-pulse">
      <path d="M2.6 1.6l.4 1.1 1.1.4-1.1.4-.4 1.1-.4-1.1-1.1-.4 1.1-.4zM17.4 .8l.4 1.1 1.1.4-1.1.4-.4 1.1-.4-1.1-1.1-.4 1.1-.4zM17.6 15.4l.3.8.8.3-.8.3-.3.8-.3-.8-.8-.3.8-.3z" fill="#FFC83D" />
    </g>
  </svg>
)


const Boba = () => (
  <svg viewBox="0 0 20 20" className="emo emo-anim-bounce">
    <path d="M11.2 .8l-1.1 4.6" stroke="#E86A6A" strokeWidth="1.5" strokeLinecap="round" />
    <rect x="4.4" y="5.2" width="11.2" height="1.9" rx="0.95" fill="#EEF2F7" stroke="#6B7A90" strokeWidth="0.7" />
    <path d="M5.3 7.1h9.4l-1.1 10.9c-.1.9-.8 1.5-1.7 1.5H8.1c-.9 0-1.6-.6-1.7-1.5z" fill="#F6E9CF" stroke="#B98A00" strokeWidth="0.8" strokeLinejoin="round" />
    <path d="M5.9 11.2h8.2l-.5 6.8c-.1.8-.7 1.3-1.6 1.3H8c-.9 0-1.5-.5-1.6-1.3z" fill="#D9A066" />
    <circle cx="8" cy="17.5" r="0.85" fill="#4B2E1A" /><circle cx="10.2" cy="17.9" r="0.85" fill="#4B2E1A" />
    <circle cx="12.2" cy="17.3" r="0.85" fill="#4B2E1A" /><circle cx="9.2" cy="15.9" r="0.85" fill="#4B2E1A" />
    <circle cx="11.3" cy="15.6" r="0.85" fill="#4B2E1A" />
  </svg>
)

const Comet = () => (
  <svg viewBox="0 0 20 20" className="emo emo-anim-shake">
    <path d="M12.4 7.4L1.4 17.8l9.6-6.4z" fill="#FFB13D" opacity="0.55" />
    <path d="M12.6 7.6L3.6 12.6l7.6-.4z" fill="#FFC83D" opacity="0.45" />
    <path d="M12.2 7.8L7.4 16.8l3.6-5.4z" fill="#FFC83D" opacity="0.45" />
    <circle cx="13.6" cy="6.4" r="4" fill="#FFD764" stroke="#B98A00" strokeWidth="1" />
    <circle cx="12.6" cy="5.6" r="1.1" fill="#FFF6D6" />
    <path d="M17.6 1.6l.4 1.1 1.1.4-1.1.4-.4 1.1-.4-1.1-1.1-.4 1.1-.4z" fill="#FFC83D" className="emo-anim-pulse" />
  </svg>
)

const Diamond = () => (
  <svg viewBox="0 0 20 20" className="emo">
    <path d="M5.2 3.2h9.6l4 5L10 18.8 1.2 8.2z" fill="#6FD3FF" stroke="#2A8FBF" strokeWidth="0.9" strokeLinejoin="round" />
    <path d="M1.2 8.2h17.6M7.4 3.2L5.6 8.2 10 18.8M12.6 3.2l1.8 5L10 18.8" stroke="#2A8FBF" strokeWidth="0.7" fill="none" strokeLinejoin="round" />
    <path d="M7.4 3.2L10 8.2l2.6-5z" fill="#BFEAFF" />
    <g className="emo-anim-pulse"><path d="M16.4 1l.4 1.1 1.1.4-1.1.4-.4 1.1-.4-1.1-1.1-.4 1.1-.4z" fill="#FFF" stroke="#2A8FBF" strokeWidth="0.3" /></g>
  </svg>
)

// ── Screen-effect icons: what an owned effect looks like inline ─────
const FxConfetti = () => (
  <svg viewBox="0 0 20 20" className="emo">
    <path d="M2.2 18l4-11.2 7 7z" fill="#FFB13D" stroke="#B98A00" strokeWidth="0.8" strokeLinejoin="round" />
    <path d="M4 13.2l3.8 3.8M5.2 9.8l5 5" stroke="#B98A00" strokeWidth="0.6" />
    <g className="emo-anim-pulse">
      <circle cx="12.4" cy="4.4" r="1" fill="#E86A6A" /><circle cx="16.4" cy="8" r="1" fill="#4FA3E0" />
      <rect x="10" y="8" width="1.8" height="1.8" fill="#7BD88F" transform="rotate(30 10.9 8.9)" />
      <rect x="15.4" y="2.6" width="1.8" height="1.8" fill="#A259FF" transform="rotate(-20 16.3 3.5)" />
      <circle cx="18" cy="12.6" r="0.8" fill="#FFC83D" />
    </g>
  </svg>
)

const heartPath = 'M10 17s-6-3.9-6-8.2C4 6.4 5.6 5 7.4 5c1.1 0 2.1.6 2.6 1.5.5-.9 1.5-1.5 2.6-1.5 1.8 0 3.4 1.4 3.4 3.8C16 13.1 10 17 10 17z'
const FxHearts = () => (
  <svg viewBox="0 0 20 20" className="emo emo-anim-bounce">
    <path d={heartPath} fill="#E8506A" stroke="#B0304A" strokeWidth="0.8" transform="translate(-1.6 2.4) scale(0.8)" />
    <path d={heartPath} fill="#FF7A92" stroke="#B0304A" strokeWidth="0.7" transform="translate(7.6 -1.2) scale(0.62)" />
    <path d={heartPath} fill="#FFA3B4" stroke="#B0304A" strokeWidth="0.6" transform="translate(9 8.6) scale(0.5)" />
  </svg>
)

const FxFireworks = () => (
  <svg viewBox="0 0 20 20" className="emo">
    <rect x="0.5" y="0.5" width="19" height="19" rx="3" fill="#1B2240" />
    <g className="emo-anim-pulse" stroke="#FFC83D" strokeWidth="1.1" strokeLinecap="round">
      <path d="M10 3v3.4M10 13.6V17M3 10h3.4M13.6 10H17M5 5l2.4 2.4M12.6 12.6L15 15M15 5l-2.4 2.4M7.4 12.6L5 15" />
    </g>
    <circle cx="10" cy="10" r="1.2" fill="#FFF6D6" />
    <circle cx="16.4" cy="3.6" r="0.8" fill="#E86A6A" /><circle cx="3.4" cy="16.2" r="0.8" fill="#7BD88F" />
  </svg>
)

const FxAurora = () => (
  <svg viewBox="0 0 20 20" className="emo">
    <rect x="0.5" y="0.5" width="19" height="19" rx="3" fill="#0F1A33" />
    <path d="M1 12c3-6 5 2 9-3s6 2 9-2v8H1z" fill="#3DDC97" opacity="0.7" className="emo-anim-pulse" />
    <path d="M1 15c3-5 6 1 9-2s6 1 9-1v6H1z" fill="#7C5CFF" opacity="0.65" />
    <circle cx="4" cy="4" r="0.5" fill="#FFF" /><circle cx="14" cy="3" r="0.5" fill="#FFF" /><circle cx="16.6" cy="6.4" r="0.4" fill="#FFF" />
  </svg>
)

// ── Stickers: big (100×100) hand-drawn pieces, shown large when they are
// the whole message. ───────────────────────────────────────────────────
const StickerHello = () => (
  <svg viewBox="0 0 100 100" className="sticker emo-anim-bounce">
    <ellipse cx="50" cy="90" rx="22" ry="4" fill="#000" opacity="0.12" />
    <circle cx="50" cy="58" r="32" fill="#5FD0C5" stroke="#2C8F86" strokeWidth="3" />
    <circle cx="39" cy="52" r="4.2" fill="#12423E" /><circle cx="61" cy="52" r="4.2" fill="#12423E" />
    <circle cx="40.2" cy="50.8" r="1.3" fill="#FFF" /><circle cx="62.2" cy="50.8" r="1.3" fill="#FFF" />
    <path d="M38 67c5 6.5 19 6.5 24 0" stroke="#12423E" strokeWidth="3.4" fill="none" strokeLinecap="round" />
    <circle cx="31" cy="64" r="4.5" fill="#FF9DB0" opacity="0.7" /><circle cx="69" cy="64" r="4.5" fill="#FF9DB0" opacity="0.7" />
    <g className="emo-anim-shake" style={{ transformOrigin: '84px 58px' }}>
      <path d="M80 62c4-4 8-10 7-16" stroke="#2C8F86" strokeWidth="6" fill="none" strokeLinecap="round" />
      <circle cx="87" cy="42" r="7" fill="#5FD0C5" stroke="#2C8F86" strokeWidth="3" />
    </g>
    <rect x="6" y="8" width="38" height="24" rx="12" fill="#FFF" stroke="#2C8F86" strokeWidth="2.4" />
    <path d="M30 31l4 9 4-9z" fill="#FFF" stroke="#2C8F86" strokeWidth="2.4" strokeLinejoin="round" />
    <path d="M30 29.6h8" stroke="#FFF" strokeWidth="3.4" />
    <text x="25" y="26.4" textAnchor="middle" fontSize="15" fontWeight="900" fill="#12423E" fontFamily="Arial, sans-serif">hi!</text>
  </svg>
)

const StickerGG = () => (
  <svg viewBox="0 0 100 100" className="sticker">
    <g transform="rotate(-7 50 50)">
      <rect x="12" y="22" width="76" height="56" rx="16" fill="#FFD23F" stroke="#C98F00" strokeWidth="4" />
      <rect x="18" y="28" width="64" height="44" rx="11" fill="none" stroke="#FFF6D6" strokeWidth="2" strokeDasharray="3 5" />
      <text x="50" y="62" textAnchor="middle" fontSize="38" fontWeight="900" fill="#5B4300" fontFamily="Arial Black, Arial, sans-serif">GG</text>
    </g>
    <g className="emo-anim-pulse" fill="#FFC83D" stroke="#C98F00" strokeWidth="1.5">
      <path d="M86 12l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" /><path d="M12 80l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
    </g>
  </svg>
)

const StickerCat = () => (
  <svg viewBox="0 0 100 100" className="sticker emo-anim-bounce">
    <path d="M18 44L22 12l24 18zM82 44L78 12 54 30z" fill="#F5A04A" stroke="#B5681C" strokeWidth="3.4" strokeLinejoin="round" />
    <path d="M24 34l1.6-12 9 7zM76 34l-1.6-12-9 7z" fill="#FFC9A0" />
    <ellipse cx="50" cy="56" rx="34" ry="30" fill="#F5A04A" stroke="#B5681C" strokeWidth="3.4" />
    <path d="M50 26v9M40 28l2 8M60 28l-2 8" stroke="#B5681C" strokeWidth="3" strokeLinecap="round" />
    <ellipse cx="37" cy="54" rx="5" ry="6.4" fill="#2A1A0B" /><ellipse cx="63" cy="54" rx="5" ry="6.4" fill="#2A1A0B" />
    <circle cx="38.6" cy="51.6" r="1.8" fill="#FFF" /><circle cx="64.6" cy="51.6" r="1.8" fill="#FFF" />
    <path d="M45 64h10l-5 5z" fill="#E86A8A" stroke="#B0304A" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M50 69c0 5-5 7-9 4M50 69c0 5 5 7 9 4" stroke="#2A1A0B" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    <path d="M10 60l16 3M10 70l16-3M90 60L74 63M90 70l-16-3" stroke="#B5681C" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
)

const StickerCosmic = () => (
  <svg viewBox="0 0 100 100" className="sticker">
    <defs>
      <radialGradient id="cosmic-planet" cx="35%" cy="30%" r="80%">
        <stop offset="0" stopColor="#D9B8FF" /><stop offset="0.55" stopColor="#8F5BFF" /><stop offset="1" stopColor="#3A1C8F" />
      </radialGradient>
    </defs>
    <rect x="4" y="4" width="92" height="92" rx="22" fill="#10122E" />
    <g className="emo-anim-pulse" fill="#FFF">
      <circle cx="16" cy="20" r="1.6" /><circle cx="82" cy="16" r="1.2" /><circle cx="88" cy="70" r="1.6" />
      <circle cx="14" cy="78" r="1.2" /><circle cx="70" cy="86" r="1" /><circle cx="30" cy="10" r="1" />
    </g>
    <path d="M12 56c20 14 60 6 76-14" stroke="#FFC83D" strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.9" />
    <circle cx="50" cy="50" r="24" fill="url(#cosmic-planet)" />
    <circle cx="42" cy="46" r="3" fill="#10122E" /><circle cx="58" cy="46" r="3" fill="#10122E" />
    <path d="M43 57c4 4.4 10 4.4 14 0" stroke="#10122E" strokeWidth="2.8" fill="none" strokeLinecap="round" />
    <path d="M80 22l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#FFC83D" className="emo-anim-pulse" />
  </svg>
)

const art: Record<string, typeof Smile> = {
  squad: Squad, cheers: Cheers, crown: Crown, rocket: Rocket, legend: Legend,
  boba: Boba, comet: Comet, diamond: Diamond,
  'fx-confetti': FxConfetti, 'fx-hearts': FxHearts, 'fx-fireworks': FxFireworks, 'fx-aurora': FxAurora,
  'sticker-hello': StickerHello, 'sticker-gg': StickerGG, 'sticker-cat': StickerCat, 'sticker-cosmic': StickerCosmic,
  smile: Smile, laugh: Laugh, wink: Wink, sad: Sad, cry: Cry,
  wave: Wave, heart: Heart, kiss: Kiss, cool: Cool, angry: Angry,
  surprised: Surprised, blush: Blush, tongue: Tongue, sweat: Sweat,
  party: Party, sleepy: Sleepy, think: Think, yes: Yes, no: No, hug: Hug,
}

/** `shortcut` is what the sender actually typed — a reward emoticon from
 *  someone without its tier renders as exactly that text. */
/** `shortcut` is what the sender actually typed — a reward from someone
 *  who doesn't own it renders as exactly that text. `big` draws a sticker
 *  at full size (used when it is the whole message). */
export function Emoticon({ id, shortcut, big = false }: { id: string; shortcut?: string; big?: boolean }) {
  const owned = useContext(SenderItemsContext)
  const reward = rewardById(id)
  if (reward && !owned.has(id)) return <>{shortcut ?? ''}</>
  const A = art[id]
  if (A) {
    const cls = reward?.kind === 'sticker' ? (big ? 'emoticon sticker-big' : 'emoticon sticker-inline') : 'emoticon'
    return <span className={cls}><A /></span>
  }
  return <span className="emoticon" role="img">{glyphs.get(id) ?? id}</span>
}
