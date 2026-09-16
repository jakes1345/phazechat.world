import { useState } from 'react'
import { PresenceIcon } from './PresenceIcon'

type Props = {
  friends: Record<string, string>
  moods: Record<string, string>
  onOpen: (username: string) => void
  /** contact -> the group this viewer has filed them under. Absent or ""
   *  means ungrouped. Confirmed as early as Skype 3.0.0.214 (2007) — see
   *  docs/skype-eras/skype3.md. */
  contactGroups: Record<string, string>
  onSetGroup: (username: string, groupName: string) => void
}

const UNGROUPED = 'Other Contacts'

// Named groups first (alphabetically), ungrouped contacts in their own
// bucket last — the same shape real Skype's contact-list groups took.
// Within a group: online contacts above offline, then alphabetical.
export function ContactsView({ friends, moods, onOpen, contactGroups, onSetGroup }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const byGroup = new Map<string, string[]>()
  for (const u of Object.keys(friends)) {
    const g = contactGroups[u] || UNGROUPED
    if (!byGroup.has(g)) byGroup.set(g, [])
    byGroup.get(g)!.push(u)
  }
  const sortNames = (names: string[]) =>
    [...names].sort((a, b) => {
      const oa = friends[a] !== 'Offline' ? 0 : 1
      const ob = friends[b] !== 'Offline' ? 0 : 1
      if (oa !== ob) return oa - ob
      return a.localeCompare(b)
    })
  const groupOrder = [...byGroup.keys()].filter((g) => g !== UNGROUPED).sort()
  if (byGroup.has(UNGROUPED)) groupOrder.push(UNGROUPED)

  const existingGroups = groupOrder.filter((g) => g !== UNGROUPED)

  const openEditor = (u: string) => {
    setDraft(contactGroups[u] || '')
    setEditing(editing === u ? null : u)
  }
  const applyGroup = (u: string, name: string) => {
    onSetGroup(u, name.trim())
    setEditing(null)
  }

  return (
    <div className="contacts-view">
      {Object.keys(friends).length === 0 && <div className="contacts-empty">No contacts yet — add one below.</div>}
      {groupOrder.map((g) => (
        <div key={g}>
          <div className="contacts-group-header">{g}</div>
          {sortNames(byGroup.get(g)!).map((u) => (
            <div key={u} className="contacts-row-wrap">
              <button type="button" className="contacts-row" onClick={() => onOpen(u)}>
                <PresenceIcon status={friends[u]} />
                <span className="contacts-name">{u}</span>
                {moods[u] && <span className="contacts-mood">{moods[u]}</span>}
              </button>
              <button type="button" className="contacts-group-tag" title="Move to group" onClick={() => openEditor(u)}>🏷️</button>
              {editing === u && (
                <div className="contacts-group-editor">
                  {existingGroups.map((name) => (
                    <button key={name} type="button" className="contacts-group-chip" onClick={() => applyGroup(u, name)}>{name}</button>
                  ))}
                  <input
                    className="contacts-group-input"
                    value={draft}
                    maxLength={60}
                    placeholder="New group…"
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') applyGroup(u, draft) }}
                  />
                  <button type="button" className="contacts-group-apply" disabled={!draft.trim()} onClick={() => applyGroup(u, draft)}>Set</button>
                  {contactGroups[u] && (
                    <button type="button" className="contacts-group-clear" onClick={() => applyGroup(u, '')}>Ungroup</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
