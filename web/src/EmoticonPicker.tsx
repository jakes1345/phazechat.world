import { useEffect, useRef, useState } from 'react'
import { EXPRESSIVE_EMOTICONS, FLAG_EMOTICONS } from './emoticons'
import { Emoticon } from './emoticonArt'
import { REWARDS, SenderItemsContext, rarityMeta } from './referralRewards'

type Props = {
  onPick: (shortcut: string) => void
  onClose: () => void
  /** Rewards this user owns — only these can be sent as art. */
  myItems?: ReadonlySet<string>
  /** Opens Settings → Invite Friends (where crates are earned and opened). */
  onOpenInvite?: () => void
}

const NONE: ReadonlySet<string> = new Set()
const ALL: ReadonlySet<string> = new Set(REWARDS.map((r) => r.id))

export function EmoticonPicker({ onPick, onClose, myItems = NONE, onOpenInvite }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // Flags get their own tab — 190-odd of them would otherwise drown out
  // the everyday faces and gestures in one flat grid.
  const [tab, setTab] = useState<'faces' | 'flags' | 'rewards'>('faces')
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [onClose])
  const list = tab === 'faces' ? EXPRESSIVE_EMOTICONS : FLAG_EMOTICONS
  const owned = REWARDS.filter((r) => myItems.has(r.id)).length
  return (
    <div className="emoticon-picker" ref={ref} role="dialog" aria-label="Emoticon picker">
      <div className="emoticon-picker-tabs">
        <button type="button" className={tab === 'faces' ? 'on' : ''} onClick={() => setTab('faces')}>Faces</button>
        <button type="button" className={tab === 'flags' ? 'on' : ''} onClick={() => setTab('flags')}>Flags</button>
        <button type="button" className={tab === 'rewards' ? 'on' : ''} onClick={() => setTab('rewards')}>Rewards</button>
      </div>
      {tab === 'rewards' ? (
        // Everything draws as art here — the point is seeing what's out there.
        <SenderItemsContext.Provider value={ALL}>
          <div className="emoticon-picker-grid">
            {REWARDS.map((r) => {
              const locked = !myItems.has(r.id)
              return (
                <button key={r.id} type="button" className={locked ? 'emo-locked' : ''}
                  style={{ boxShadow: locked ? undefined : `inset 0 0 0 1.5px ${rarityMeta(r.rarity).color}` }}
                  title={locked
                    ? `${r.name} (${rarityMeta(r.rarity).label}) — find it in a crate`
                    : `${r.name} ${r.shortcut}`}
                  onClick={() => (locked ? onOpenInvite?.() : onPick(r.shortcut))}>
                  <Emoticon id={r.id} />
                  {locked && <span className="emo-lock" aria-hidden>🔒</span>}
                </button>
              )
            })}
          </div>
          <p className="emoticon-picker-note">
            {owned}/{REWARDS.length} collected. Each friend you invite earns a crate.{' '}
            <button type="button" className="link-btn" onClick={onOpenInvite}>Open crates</button>
          </p>
        </SenderItemsContext.Provider>
      ) : (
        <div className="emoticon-picker-grid">
          {list.map((e) => (
            <button key={e.id} type="button" title={`${e.label} ${e.shortcuts[0]}`}
              onClick={() => onPick(e.shortcuts[0])}>
              <Emoticon id={e.id} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
