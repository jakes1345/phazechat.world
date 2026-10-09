# Referral rewards: crates, shards, and what they unlock

Bring a friend, earn a crate; a crate opens to a random cosmetic. Earned
only — nothing here is for sale (paid random boxes are treated as gambling
in several jurisdictions, and this is a thank-you, not a store).

## How it works

1. A friend signs up through your invite link (`?ref=you`) and **verifies
   their email** → you earn one crate (`syncCrates`, `nexus_server/rewards.go`).
2. Open it in Settings → Invite Friends. The server rolls a rarity
   (Common 60 / Rare 28 / Epic 10 / Legendary 2), then an item of that rarity
   **you don't own yet**. Duplicates only happen once you own everything of
   the rarity that dropped; a duplicate becomes **shards**.
3. Shards craft any specific item you're missing (`craft_reward`), so bad
   luck is never a dead end.
4. **Pity:** 3 crates in a row below Rare → the next is at least Rare;
   9 below Epic → the next is at least Epic.
5. **Ambassador badge** at 10 verified friends — the one deterministic reward.

## Kinds of reward

| Kind | What it does | Where it shows |
|---|---|---|
| emoticon | Animated house-style art for a shortcode like `(crown)` | Any message that uses it |
| sticker | Big art; draws full size when it's the whole message | Message bubbles |
| effect | Full-screen animation when a message contains its shortcode | Sender's and recipient's screens |

**Rendering is gated by the sender's inventory.** Anyone can type `(crown)`,
but receivers only draw it as art (or play an effect) if the *server told them
the sender owns it*. Otherwise it stays plain text. 1:1 messages are
end-to-end encrypted, so the server never reads messages — it only publishes
inventories (`referral_perks`) to friends.

## Anti-farming

- A referral counts only after email verification (disposable domains and
  domains without MX are refused at signup).
- One signup IP can earn a given referrer at most **2** crates.
- At most **5** crates accrue per 24h; the rest are picked up later
  (`syncCrates` is idempotent and re-runs on login/stats).

## Tuning (all in `nexus_server/rewards.go`)

`rarityWeight`, `pityRareAfter`, `pityEpicAfter`, `shardsForDuplicate`,
`craftCost`, `maxCratesPerSignupIP`, `maxCratesPerDay`. The odds shown in
Settings come from `RARITIES` in `web/src/referralRewards.ts` — keep them in
step (a test checks the server weights sum to 100).

## Adding a reward

1. Add it to `rewardCatalog` in `rewards.go` **and** `web/src/rewardCatalog.json`
   (same order — `TestRewardCatalogMatchesWebCatalog` fails if they drift).
2. Draw it in `web/src/emoticonArt.tsx` and register it in the `art` map
   (`referralRewards.test.tsx` fails if any reward has no art).
3. Effects also need a branch in `web/src/ScreenEffects.tsx`.

Everything shipped here is original art — no third-party or Microsoft assets.

## Not built yet

Android has no crate UI (its invite screen still shows the friend count).
Planned: bubble styles, name/avatar flair, signature ringtones, call effects,
welcome crates for invitees, gifting duplicates.
