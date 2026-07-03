import { useEffect, useRef, useState } from 'react'

export function MoodEditor({ value, onSave }: { value: string; onSave: (mood: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) ref.current?.select() }, [editing])
  if (!editing)
    return (
      <button type="button" className={`mood-line${value ? '' : ' empty'}`}
        onClick={() => { setDraft(value); setEditing(true) }}>
        {value || 'Share what’s on your mind…'}
      </button>
    )
  return (
    <input ref={ref} className="mood-line-input" value={draft} maxLength={140}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { onSave(draft.trim()); setEditing(false) }
        if (e.key === 'Escape') setEditing(false)
      }}
      onBlur={() => setEditing(false)} />
  )
}
