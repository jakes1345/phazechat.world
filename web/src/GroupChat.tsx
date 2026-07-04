import { useEffect, useRef, useState } from 'react'

export type GroupLine = {
  id: string
  sender: string
  body: string
  ts: number
  me: boolean
}

type Props = {
  name: string
  members: string[]
  lines: GroupLine[]
  renderBody: (text: string) => React.ReactNode
  senderColor: (name: string) => string
  onSend: (text: string) => void
  onLeave: () => void
  onClose: () => void
}

/** Group conversation pane. Messages are not end-to-end encrypted (the
 *  server fans them out per member), and the header says so. */
export default function GroupChat({ name, members, lines, renderBody, senderColor, onSend, onLeave, onClose }: Props) {
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [lines.length])

  const send = () => {
    const text = draft.trim()
    if (!text) return
    onSend(text)
    setDraft('')
  }

  return (
    <section className="panel grow group-chat">
      <div className="chat-header-bar">
        <span className="avatar group-avatar">{name[0]?.toUpperCase()}</span>
        <span className="chat-peer-info">
          <span className="chat-peer-name">{name}</span>
          <span className="chat-peer-status">{members.length} people · not end-to-end encrypted</span>
        </span>
        <span className="group-chat-actions">
          <button type="button" onClick={onLeave} title="Leave group">Leave</button>
          <button type="button" onClick={onClose} title="Close">×</button>
        </span>
      </div>
      <div className="group-chat-scroll" ref={scrollRef}>
        {lines.length === 0 && <div className="group-chat-empty">No messages yet — say hi.</div>}
        {lines.map((l) => (
          <div key={l.id} className={`group-line ${l.me ? 'me' : ''}`}>
            {!l.me && <span className="group-line-sender" style={{ color: senderColor(l.sender) }}>{l.sender}</span>}
            <span className="group-line-body">{renderBody(l.body)}</span>
            <span className="group-line-ts">{new Date(l.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        ))}
      </div>
      <div className="group-chat-compose">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send() }}
          placeholder="Message the group…"
        />
        <button type="button" className="send-pill" onClick={send} disabled={!draft.trim()}>Send message</button>
      </div>
    </section>
  )
}
