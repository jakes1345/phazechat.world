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
  renderBody: (text: string) => React.ReactNode
  senderColor: (name: string) => string
  onSend: (text: string) => void
  onLeave: () => void
  onClose: () => void
  onAddMembers: (usernames: string[]) => void
  onRemoveMember: (username: string) => void
  onRename: (newName: string) => void
}

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
}: Props) {
  const [draft, setDraft] = useState('')
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

  const send = () => {
    const text = draft.trim()
    if (!text) return
    onSend(text)
    setDraft('')
  }

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
          <span className="chat-peer-status">{members.length} people · not end-to-end encrypted</span>
        </span>
        <span className="group-chat-actions">
          <button type="button" onClick={openManage} title="Manage group">Manage</button>
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
