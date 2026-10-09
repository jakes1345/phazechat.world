import { useCallback, useEffect, useRef, useState } from 'react'
import type { NexusMessage } from './nexusTypes'
import { Emoticon } from './emoticonArt'
import { AMBASSADOR_AT, RARITIES, REWARDS, SenderItemsContext, rarityMeta, rewardById, type Reward } from './referralRewards'

const ALL: ReadonlySet<string> = new Set(REWARDS.map((r) => r.id))
const MIN_SHAKE_MS = 1100

type Props = {
  send: (m: NexusMessage) => void
  subscribe: (handler: (m: NexusMessage) => void) => () => void
}

/** Invite rewards: crates earned from verified friends, the opening
 *  moment, and the collection. Everything shown here comes from the
 *  server (nexus_server/rewards.go) — this component only displays it. */
export default function RewardsPanel({ send, subscribe }: Props) {
  const [loaded, setLoaded] = useState(false)
  const [count, setCount] = useState(0)
  const [joined, setJoined] = useState<string[]>([])
  const [pending, setPending] = useState<string[]>([])
  const [crates, setCrates] = useState(0)
  const [items, setItems] = useState<string[]>([])
  const [toAmbassador, setToAmbassador] = useState(AMBASSADOR_AT)
  const [shards, setShards] = useState(0)
  // Shards needed to craft an item, by rarity — the server is the source.
  const [costs, setCosts] = useState<Record<string, number>>({})
  const [dupe, setDupe] = useState<{ gained: number } | null>(null)
  const [opening, setOpening] = useState(false)
  const [reveal, setReveal] = useState<Reward | null>(null)
  const [err, setErr] = useState('')
  const startedAt = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onMsg = useCallback((msg: NexusMessage) => {
    switch (msg.type) {
      case 'referral_stats':
        setLoaded(true)
        setCount(parseInt(msg.token || '0', 10))
        setJoined(msg.results || [])
        setPending(msg.members || [])
        setCrates(msg.crates ?? 0)
        setItems(msg.items || [])
        setToAmbassador(msg.duration ?? 0)
        setShards(msg.shards ?? 0)
        setCosts(msg.costs ?? {})
        break
      case 'craft_result':
        setShards(msg.shards ?? 0)
        if (msg.error) { setErr(msg.error); break }
        setErr('')
        setItems(msg.items || [])
        setDupe(null)
        setReveal(msg.item ? rewardById(msg.item) ?? null : null)
        break
      case 'crate_earned':
      case 'referral_joined':
        // A friend just verified — refresh the lists and counts.
        send({ type: 'get_referral_stats' })
        break
      case 'crate_opened': {
        const finish = () => {
          setOpening(false)
          if (msg.error) { setErr(msg.error); setCrates(msg.crates ?? 0); return }
          setCrates(msg.crates ?? 0)
          setItems(msg.items || [])
          setShards(msg.shards ?? 0)
          setDupe(msg.dupe ? { gained: msg.shards_gained ?? 0 } : null)
          setReveal(msg.item ? rewardById(msg.item) ?? null : null)
        }
        // Let the box shake long enough to feel like something happened,
        // however fast the server answered.
        const wait = Math.max(0, MIN_SHAKE_MS - (Date.now() - startedAt.current))
        timer.current = setTimeout(finish, wait)
        break
      }
    }
  }, [send])

  useEffect(() => subscribe(onMsg), [subscribe, onMsg])
  useEffect(() => { send({ type: 'get_referral_stats' }) }, [send])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const craft = (r: Reward) => {
    setErr('')
    send({ type: 'craft_reward', item: r.id })
  }

  const open = () => {
    if (opening || crates < 1) return
    setErr('')
    setReveal(null)
    setDupe(null)
    setOpening(true)
    startedAt.current = Date.now()
    send({ type: 'open_crate' })
  }

  const owned = new Set(items)

  return (
    <div className="rewards-panel">
      <h3 className="settings-section-title">Invite rewards</h3>
      <p className="settings-label">
        Every friend who joins from your link and verifies their email earns you a crate.
        Crates open to a random reward — emoticons, big stickers and screen effects only you can send.
      </p>

      <div className={`crate-card ${opening ? 'opening' : ''} ${crates > 0 ? 'has-crates' : ''}`}>
        <div className="crate-box" aria-hidden>🎁</div>
        <div className="crate-info">
          <strong>{crates} crate{crates === 1 ? '' : 's'} to open</strong>
          <span>{count} friend{count === 1 ? '' : 's'} joined · ✦ {shards} shards
            {toAmbassador > 0
              ? ` · ${toAmbassador} more for the 🌟 Ambassador badge`
              : ' · 🌟 Ambassador'}
          </span>
        </div>
        <button className="settings-btn" disabled={crates < 1 || opening} onClick={open}>
          {opening ? 'Opening…' : 'Open crate'}
        </button>
      </div>
      {err && <p className="settings-msg err">{err}</p>}

      {reveal && (
        <div className="crate-reveal" style={{ ['--rarity' as string]: rarityMeta(reveal.rarity).color }} role="status">
          <span className="crate-reveal-rarity">{rarityMeta(reveal.rarity).label}</span>
          <SenderItemsContext.Provider value={ALL}>
            <span className={`crate-reveal-art kind-${reveal.kind}`}><Emoticon id={reveal.id} big /></span>
          </SenderItemsContext.Provider>
          <strong>{reveal.name}</strong>
          <span className="crate-reveal-how">
            {dupe
              ? <>You already had this one — it turned into <strong>✦ {dupe.gained} shards</strong>. Spend shards below to craft anything you're missing.</>
              : reveal.kind === 'effect'
              ? <>Send <code>{reveal.shortcut}</code> in a chat and everyone sees it play.</>
              : reveal.kind === 'sticker'
                ? <>Send <code>{reveal.shortcut}</code> on its own to post it big.</>
                : <>Type <code>{reveal.shortcut}</code> or pick it in the emoticon picker.</>}
          </span>
          <span className="crate-reveal-actions">
            {crates > 0 && <button className="settings-btn" onClick={open}>Open another</button>}
            <button className="settings-btn" onClick={() => setReveal(null)}>Nice</button>
          </span>
        </div>
      )}

      <h4 className="rewards-sub">Your collection · {items.length}/{REWARDS.length}</h4>
      <SenderItemsContext.Provider value={ALL}>
        <div className="rewards-grid">
          {REWARDS.map((r) => {
            const have = owned.has(r.id)
            const meta = rarityMeta(r.rarity)
            return (
              <div key={r.id} className={`rewards-cell ${have ? 'have' : 'locked'}`}
                style={{ ['--rarity' as string]: meta.color }}
                title={have ? `${r.name} — ${meta.label} · ${r.shortcut}` : `${meta.label} reward — still in the crates`}>
                <Emoticon id={r.id} />
                <span className="rewards-cell-name">{have ? r.name : '???'}</span>
                {!have && costs[r.rarity] !== undefined && (
                  <button type="button" className="rewards-craft" disabled={shards < costs[r.rarity]}
                    title={shards >= costs[r.rarity] ? `Craft ${r.name}` : `Needs ${costs[r.rarity]} shards`}
                    onClick={() => craft(r)}>✦ {costs[r.rarity]}</button>
                )}
              </div>
            )
          })}
        </div>
      </SenderItemsContext.Provider>
      <p className="settings-label rewards-odds">
        Crate odds: {RARITIES.map((r) => `${r.label} ${r.odds}%`).join(' · ')}. You won't get a duplicate
        until you own every item of that rarity — after that, duplicates turn into ✦ shards you can spend to
        craft the exact thing you're missing. You're also guaranteed a Rare or better within every 4 crates.
        {!loaded && ' (loading…)'}
      </p>

      {joined.length > 0 && <p className="referral-users">Joined from your link: {joined.join(', ')}</p>}
      {pending.length > 0 && <p className="referral-users">Waiting to verify their email: {pending.join(', ')}</p>}
    </div>
  )
}
