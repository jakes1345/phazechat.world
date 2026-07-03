import { useEffect, useRef } from 'react'
import { EMOTICONS } from './emoticons'
import { Emoticon } from './emoticonArt'

export function EmoticonPicker({ onPick, onClose }: { onPick: (shortcut: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [onClose])
  return (
    <div className="emoticon-picker" ref={ref} role="dialog" aria-label="Emoticon picker">
      {EMOTICONS.map((e) => (
        <button key={e.id} type="button" title={`${e.label} ${e.shortcuts[0]}`}
          onClick={() => onPick(e.shortcuts[0])}>
          <Emoticon id={e.id} />
        </button>
      ))}
    </div>
  )
}
