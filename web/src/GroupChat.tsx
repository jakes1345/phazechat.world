import { useEffect, useRef, useState } from 'react'
import { runGroupCommand } from './groupCommands'

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
  /** Who made the group. Empty string until the creator field actually
   *  arrives from the server — treat that as "nobody has admin rights yet"
   *  rather than guessing, since a wrong guess here would show controls
   *  that then fail. */
  creator: string
  me: string
  /** This user's friends, so "Add people" can offer only names the server
   *  will actually accept — it applies the identical friends-only rule. */
  friends: string[]
  lines: GroupLine[]
  renderBody: (text: string, sender: string) => React.ReactNode
  senderColor: (name: string) => string
  onSend: (text: string) => void
  onLeave: () => void
  onClose: () => void
  onAddMembers: (usernames: string[]) => void
  onRemoveMember: (username: string) => void
  onRename: (newName: string) => void
  /** Classic eras (Skype 3-7) understood /topic, /add, /kick… in group
   *  chats; Skype 8's cloud chats dropped them. Off means slash text is
   *  sent as an ordinary message. */
  classicCommands: boolean
  /** False once /alertsoff muted this group's message sounds. */
  alertsOn: boolean
  onSetAlerts: (on: boolean) => void
}

/** A line only this user sees — command output and errors. */
type Notice = { id: string; text: string; ts: number }

/** Group conversation pane. Messages are not end-to-end encrypted (the
 *  server fans them out per member), and the header says so.
 *
 *  Membership and the name used to be frozen forever after creation — no
 *  add, no remove, no rename, in any client (docs/skype-era-gaps.md §3).
 *  The "Manage" panel here is that capability. It's deliberately minimal:
 *  the creator is the only admin concept, matching the smallest end of what
 *  real Skype group chats supported rather than a full Creator/Master/
 *  Helper/User/Listener hierarchy — see the same doc for the ceiling if
 *  this ever needs to grow toward that. */
export default function GroupChat({
  name, members, creator, me, friends, lines, renderBody, senderColor,
  onSend, onLeave, onClose, onAddMembers, onRemoveMember, onRename,
  classicCommands, alertsOn, onSetAlerts,
}: Props) {
  const [draft, setDraft] = useState('')
  const [notices, setNotices] = useState<Notice[]>([])
  const [manageOpen, setManageOpen] = useState(false)
  const [renameDraft, setRenameDraft] = useState(name)
  const [toAdd, setToAdd] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const iAmCreator = me !== '' && me === creator

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [lines.length])

  // The rename field should track the live name until someone actually
  // starts editing it — otherwise a rename from elsewhere (another device,
  // convo_updated arriving) would silently get typed over on next render.
  useEffect(() => { setRenameDraft(name) }, [name])

  const notice = (text: string) =>
    setNotices((prev) => [...prev, { id: `n-${Date.now()}-${prev.length}`, text, ts: Date.now() }])

  const send = () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    if (!classicCommands) { onSend(text); return }
    const r = runGroupCommand(text, { me, creator, members, friends })
    switch (r.kind) {
      case 'send': onSend(r.text); break
      case 'rename': onRename(r.name); break
      case 'add':
        onAddMembers(r.users)
        if (r.notice) notice(r.notice)
        break
      case 'kick': onRemoveMember(r.user); break
      case 'leave': onLeave(); break
      case 'alerts':
        onSetAlerts(r.on)
        notice(r.on ? 'Alerts on — new messages here will play a sound.' : 'Alerts off — this group stays silent. /alertson to undo.')
        break
      case 'notice': notice(r.text); break
    }
  }

  // Command output interleaves with the conversation by time, like the
  // system lines real Skype printed into the chat itself.
  const timeline = [
    ...lines.map((l) => ({ kind: 'line' as const, ts: l.ts, line: l })),
    ...notices.map((n) => ({ kind: 'notice' as const, ts: n.ts, notice: n })),
  ].sort((a, b) => a.ts - b.ts)

  const addable = friends.filter((f) => !members.includes(f))

  const openManage = () => {
    setToAdd([])
    setRenameDraft(name)
    setManageOpen(true)
  }

  return (
    <section className="panel grow group-chat">
      <div className="chat-header-bar">
        <span className="avatar group-avatar">{name[0]?.toUpperCase()}</span>
        <span className="chat-peer-info">
          <span className="chat-peer-name">{name}</span>
          <span className="chat-peer-status">
            {members.length} people · not end-to-end encrypted{!alertsOn && ' · alerts off'}
          </span>
        </span>
        <span className="group-chat-actions">
          <button type="button" onClick={openManage} title="Manage group">Manage</button>
          <button type="button" onClick={onLeave} title="Leave group">Leave</button>
          <button type="button" onClick={onClose} title="Close">×</button>
        </span>
      </div>
      <div className="group-chat-scroll" ref={scrollRef}>
        {timeline.length === 0 && <div className="group-chat-empty">No messages yet — say hi.</div>}
        {timeline.map((item) => item.kind === 'notice' ? (
          <div key={item.notice.id} className="group-line group-notice">{item.notice.text}</div>
        ) : (
          <div key={item.line.id} className={`group-line ${item.line.me ? 'me' : ''}`}>
            {!item.line.me && <span className="group-line-sender" style={{ color: senderColor(item.line.sender) }}>{item.line.sender}</span>}
            <span className="group-line-body">{renderBody(item.line.body, item.line.sender)}</span>
            <span className="group-line-ts">{new Date(item.line.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        ))}
      </div>
      <div className="group-chat-compose">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send() }}
          placeholder={classicCommands ? 'Message the group… (/help for commands)' : 'Message the group…'}
        />
        <button type="button" className="send-pill" onClick={send} disabled={!draft.trim()}>Send message</button>
      </div>

      {manageOpen && (
        <div className="add-modal-overlay" onClick={() => setManageOpen(false)}>
          <div className="add-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="add-modal-title">Manage “{name}”</div>

            {/* Rename — creator only. The server enforces this too; hiding
                the control for everyone else isn't a substitute for that
                check, just avoids showing a button that would only ever
                fail for them. */}
            {iAmCreator ? (
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input
                  className="add-modal-input"
                  value={renameDraft}
                  maxLength={100}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  placeholder="Group name…"
                />
                <button
                  type="button"
                  className="add-modal-send"
                  disabled={!renameDraft.trim() || renameDraft.trim() === name}
                  onClick={() => onRename(renameDraft.trim())}
                >Rename</button>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: '#888', margin: '0 0 14px' }}>
                Only {creator || 'the creator'} can rename this group.
              </p>
            )}

            <div className="group-member-list" style={{ marginBottom: 14 }}>
              {members.map((m) => (
                <div key={m} className="group-manage-row">
                  <span className="avatar" style={{ background: senderColor(m), width: 22, height: 22, fontSize: 11, lineHeight: '22px' }}>
                    {m[0]?.toUpperCase()}
                  </span>
                  <span className="group-manage-name">
                    {m}{m === creator && <span className="group-manage-tag"> · creator</span>}
                  </span>
                  {iAmCreator && m !== creator && (
                    <button type="button" className="group-manage-remove" onClick={() => onRemoveMember(m)} title={`Remove ${m}`}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add people — any current member can, same as real Skype's
                default (unlocked) group chats. Restricted to friends
                because that's the rule the server actually enforces. */}
            <div className="add-modal-title" style={{ fontSize: 13 }}>Add people</div>
            {addable.length === 0 ? (
              <p style={{ fontSize: 13, color: '#888', margin: '4px 0 14px' }}>
                Everyone you're friends with is already in this group.
              </p>
            ) : (
              <div className="group-member-list" style={{ marginBottom: 14 }}>
                {addable.map((f) => (
                  <label key={f} className="group-member-row">
                    <input
                      type="checkbox"
                      checked={toAdd.includes(f)}
                      onChange={() => setToAdd((prev) => prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f])}
                    />
                    <span className="avatar" style={{ background: senderColor(f), width: 22, height: 22, fontSize: 11, lineHeight: '22px' }}>
                      {f[0]?.toUpperCase()}
                    </span>
                    <span>{f}</span>
                  </label>
                ))}
              </div>
            )}

            <div className="add-modal-actions">
              <button
                type="button"
                className="add-modal-send"
                disabled={toAdd.length === 0}
                onClick={() => { onAddMembers(toAdd); setToAdd([]) }}
              >Add {toAdd.length > 0 ? toAdd.length : ''}</button>
              <button type="button" className="add-modal-cancel" onClick={() => setManageOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
