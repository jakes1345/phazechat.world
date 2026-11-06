import { useMemo, useState } from 'react'
import type { ContactCard as Card } from './messageKinds'
import './eraFeatures.css'

/** A contact someone shared into a chat ("Send Contacts").
 *
 *  The card is only as good as what the sender knew when they shared it;
 *  the buttons act on the live account, so "Add" sends a real friend
 *  request and the server applies its normal rules to it. */
export function ContactCardView({ card, me, friends, color, onAdd, onMessage, onProfile }: {
  card: Card
  me: string | null
  /** username → presence, for people already in the contact list. */
  friends: Record<string, string>
  color: string
  onAdd: (username: string) => void
  onMessage: (username: string) => void
  onProfile: (username: string) => void
}) {
  const isMe = me === card.username
  const isFriend = card.username in friends
  const [sent, setSent] = useState(false)
  return (
    <div className="contact-card">
      <button type="button" className="contact-card-avatar" style={{ background: color }} onClick={() => onProfile(card.username)} title="View profile">
        {card.username[0]?.toUpperCase()}
      </button>
      <div className="contact-card-meta">
        <span className="contact-card-label">Contact</span>
        <span className="contact-card-name">{card.display || card.username}</span>
        {card.display && card.display !== card.username && <span className="contact-card-user">{card.username}</span>}
        {card.mood && <span className="contact-card-mood">{card.mood}</span>}
      </div>
      <div className="contact-card-actions">
        {isMe ? (
          <span className="contact-card-note">That's you</span>
        ) : isFriend ? (
          <button type="button" className="era-btn small" onClick={() => onMessage(card.username)}>Message</button>
        ) : sent ? (
          <span className="contact-card-note">Request sent</span>
        ) : (
          <button type="button" className="era-btn small primary" onClick={() => { onAdd(card.username); setSent(true) }}>Add contact</button>
        )}
      </div>
    </div>
  )
}

/** Pick one of your contacts to share. */
export function ContactPicker({ friends, exclude, moods, onPick, onClose }: {
  friends: string[]
  /** Names not worth offering, such as the person you're sending to. */
  exclude: ReadonlySet<string>
  moods: Record<string, string>
  onPick: (username: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return friends
      .filter((f) => !exclude.has(f))
      .filter((f) => !needle || f.toLowerCase().includes(needle))
      .sort((a, b) => a.localeCompare(b))
  }, [friends, exclude, q])
  return (
    <div className="era-modal-backdrop" role="dialog" aria-label="Send a contact" onClick={onClose}>
      <div className="era-modal contact-picker" onClick={(e) => e.stopPropagation()}>
        <div className="era-modal-title">Send a contact</div>
        <input autoFocus className="era-input" placeholder="Search your contacts" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="contact-picker-list">
          {list.length === 0 && <li className="contact-picker-empty">No contacts to share.</li>}
          {list.map((f) => (
            <li key={f}>
              <button type="button" onClick={() => onPick(f)}>
                <span className="contact-picker-name">{f}</span>
                {moods[f] && <span className="contact-picker-mood">{moods[f]}</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="era-modal-actions">
          <button type="button" className="era-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
