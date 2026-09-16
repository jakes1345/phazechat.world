import { useEffect, useRef, useState } from 'react'
import { EXPRESSIVE_EMOTICONS, FLAG_EMOTICONS } from './emoticons'
import { Emoticon } from './emoticonArt'

export function EmoticonPicker({ onPick, onClose }: { onPick: (shortcut: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  // Flags get their own tab — 190-odd of them would otherwise drown out
  // the everyday faces and gestures in one flat grid.
  const [tab, setTab] = useState<'faces' | 'flags'>('faces')
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [onClose])
  const list = tab === 'faces' ? EXPRESSIVE_EMOTICONS : FLAG_EMOTICONS
  return (
    <div className="emoticon-picker" ref={ref} role="dialog" aria-label="Emoticon picker">
      <div className="emoticon-picker-tabs">
        <button type="button" className={tab === 'faces' ? 'on' : ''} onClick={() => setTab('faces')}>Faces</button>
        <button type="button" className={tab === 'flags' ? 'on' : ''} onClick={() => setTab('flags')}>Flags</button>
      </div>
      <div className="emoticon-picker-grid">
        {list.map((e) => (
          <button key={e.id} type="button" title={`${e.label} ${e.shortcuts[0]}`}
            onClick={() => onPick(e.shortcuts[0])}>
            <Emoticon id={e.id} />
          </button>
        ))}
      </div>
    </div>
  )
}
