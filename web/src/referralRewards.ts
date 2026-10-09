import { createContext } from 'react'
import catalog from './rewardCatalog.json'

/** Referral reward crates. Each verified friend who joins through your
 *  invite earns a crate; opening it drops a random cosmetic from this
 *  catalog. The server decides what you own (nexus_server/rewards.go) and
 *  tells every friend's client — this file only describes the items.
 *  rewardCatalog.json is the shared source; a Go test fails if the server's
 *  list drifts from it. */

export type RewardKind = 'emoticon' | 'sticker' | 'effect'
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'
export type Reward = { id: string; kind: RewardKind; rarity: Rarity; name: string; shortcut: string }

export const REWARDS = catalog as Reward[]

/** Same odds as the server (percent). Shown in Settings so there's nothing
 *  hidden about what a crate can hold. */
export const RARITIES: { id: Rarity; label: string; odds: number; color: string }[] = [
  { id: 'common', label: 'Common', odds: 60, color: '#8aa0b8' },
  { id: 'rare', label: 'Rare', odds: 28, color: '#3b9ae1' },
  { id: 'epic', label: 'Epic', odds: 10, color: '#a259ff' },
  { id: 'legendary', label: 'Legendary', odds: 2, color: '#f5a524' },
]

/** Friends needed for the Ambassador badge — a fixed milestone on top of
 *  the random crates. Keep in sync with ambassadorAt in referrals.go. */
export const AMBASSADOR_AT = 10

const byId = new Map(REWARDS.map((r) => [r.id, r]))
export const rewardById = (id: string): Reward | undefined => byId.get(id)
export const isReward = (id: string): boolean => byId.has(id)
export const rarityMeta = (r: Rarity) => RARITIES.find((x) => x.id === r)!

/** What the sender of the text being rendered owns. Rewards draw as art
 *  (and effects play) only when the *sender* owns them — so the default,
 *  an unknown sender, keeps them as plain text rather than guessing. */
export const SenderItemsContext = createContext<ReadonlySet<string>>(new Set())
