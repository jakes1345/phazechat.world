import { PresenceIcon } from './PresenceIcon'

type Props = {
  friends: Record<string, string>
  moods: Record<string, string>
  onOpen: (username: string) => void
}

// Alphabetical, grouped by first letter, online contacts above offline
// within each group — same ordering classic clients used.
export function ContactsView({ friends, moods, onOpen }: Props) {
  const names = Object.keys(friends).sort((a, b) => {
    const la = a[0].toUpperCase(), lb = b[0].toUpperCase()
    if (la !== lb) return la < lb ? -1 : 1
    const oa = friends[a] !== 'Offline' ? 0 : 1
    const ob = friends[b] !== 'Offline' ? 0 : 1
    if (oa !== ob) return oa - ob
    return a.localeCompare(b)
  })
  let lastLetter = ''
  return (
    <div className="contacts-view">
      {names.length === 0 && <div className="contacts-empty">No contacts yet — add one below.</div>}
      {names.map((u) => {
        const letter = u[0].toUpperCase()
        const header = letter !== lastLetter
        lastLetter = letter
        return (
          <div key={u}>
            {header && <div className="contacts-letter">{letter}</div>}
            <button type="button" className="contacts-row" onClick={() => onOpen(u)}>
              <PresenceIcon status={friends[u]} />
              <span className="contacts-name">{u}</span>
              {moods[u] && <span className="contacts-mood">{moods[u]}</span>}
            </button>
          </div>
        )
      })}
    </div>
  )
}
