import type { ReactNode } from 'react'
import { EMOTICONS } from './emoticons'

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

const art: Record<string, typeof Smile> = {
  smile: Smile, laugh: Laugh, wink: Wink, sad: Sad, cry: Cry,
  wave: Wave, heart: Heart, kiss: Kiss, cool: Cool, angry: Angry,
  surprised: Surprised, blush: Blush, tongue: Tongue, sweat: Sweat,
  party: Party, sleepy: Sleepy, think: Think, yes: Yes, no: No, hug: Hug,
}

export function Emoticon({ id }: { id: string }) {
  const A = art[id]
  if (A) return <span className="emoticon"><A /></span>
  return <span className="emoticon" role="img">{glyphs.get(id) ?? id}</span>
}
