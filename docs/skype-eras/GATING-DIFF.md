# Feature gating vs. the source-verified era docs

This file checks `web/src/themes.ts`'s `FEATURES_BY_ERA` table against the six
source-verified era documents (`skype3.md` through `skype8.md`). Only claims
stated as fact in a doc's body count as evidence here — nothing from a doc's
own "Refuted or unresolved" or "Unverified / open questions" sections is
treated as support for anything, per those docs' own rules.

Everything below is checked against those six docs plus the two pre-existing
docs they were written to correct and extend (`skype-era-research.md`,
`skype-era-gaps.md`). Where a finding rests only on the older, non-verified
docs, that is called out explicitly rather than presented as newly confirmed.

---

## a. Feature-by-feature: current gate vs. verified evidence

| Feature | Gated to (themes.ts) | Earliest era with sourced evidence | Verdict |
|---|---|---|---|
| `text_chat` | skype3 | Not independently restated in the six docs (assumed 1.x baseline, predating every doc's window) | No new evidence either way — not contradicted |
| `voice_call` | skype3 | Same as above — 1.x baseline, not restated | No new evidence either way |
| `video_call` | skype3 | Confirmed present by 3.x: "introduced with the Skype 2.0 client, continued through the 3.x line" — skype3.md source [8], corroborated [14] | Matches |
| `file_transfer` | skype3 | Confirmed present by 3.0: a `DisableFileTransferPolicy` existed to *disable* it, implying it shipped enabled — skype3.md source [4] | Matches |
| `group_chat` | skype3 | Confirmed to predate 3.0: "Skype previously had group chatting capabilities but not theme-based chat rooms [Public Chats]" — skype3.md source [1][2] | Matches |
| `group_call` | skype3 | Not directly confirmed in the six docs (Skypecasts / Feb-2004 conference-calling dating comes only from the older `skype-era-research.md`, not restated in `skype3.md`'s verified body) | No new evidence either way — rests on the older doc only |
| `group_video` | skype5 | "flagship feature of this era... moved from a free beta (5-person cap, May 2010) to general availability (up to 10 total, October 2010)" — skype5.md source [11][9][2]; skype4.md independently confirms it was *absent* in 4.x: "Group video calling... was not introduced until Skype 5" — skype4.md source [4][7] | Matches (well-sourced both directions) |
| `mood` | skype3 | "Skype 3.0 introduced 'Mood Messages'" — skype3.md source [1][2] | Matches |
| `emoticons` | skype3 | Not dated in the six docs (only counts/hidden-set additions are covered, starting from 5.5 onward); consistent with, but not proof of, a pre-3.x origin | No new evidence either way |
| `screen_share` | skype4 | Skype 3.5 explicitly ruled out — the changelog "places screen sharing only in v4.0+ releases" — skype3.md source [3]. Present by 4.x but as a **paid, limited feature**: "screen sharing was originally a premium feature... made free... in 'summer 2014'" — skype4.md source [4], reaffirmed at skype6.md source [3] | Matches on era; **paid-status nuance is missing from the gate** |
| `mojis` | skype7 | **Not confirmed by this pass at all.** skype7.md's verified body contains zero claims about Mojis; the Sept 2015 date the app relies on comes only from the older, non-source-verified `skype-era-research.md` | No new evidence either way — confidence should be downgraded, not the gate itself |
| `reactions` | skype8 | **Not confirmed.** skype8.md's own Differences section: "the verified evidence confirms @mentions at that launch, but contains no claim that message-level reactions shipped with 8.0 or at any later specific date" — skype8.md (Differences section, re: sources [5][12]). The only sourced "reactions" anywhere in the six docs are 2017-18 Highlights reactions (thumbs/heart/etc. on Stories posts), a different surface, later removed | No new evidence either way — the gate is unsupported, not contradicted |
| `edit_message` | skype8 | **Contradicted.** "AfterDawn's changelog for Skype 3.2 (build 3.2.0.163, 2007) lists 'Edit chat messages' as a new feature" — skype3.md source [3], flagged explicitly in skype3.md's own Differences section as overturning the Skype-8-only assumption. Reinforced generically in skype7.md source [11] ("users to remove or edit individual messages during one hour after sending") | **Gate looks too late** |
| `delete_message` | skype8 | Same Wikipedia "remove or edit individual messages... one hour" claim appears in skype7.md's verified body, source [11] — undated/generic but placed as fact in the 7.x doc. skype8.md itself found **no** evidence for delete/edit shipping at 8.0 specifically (Differences section) | **Gate looks too late** (lower confidence than `edit_message` — no exact version number found for "delete" specifically) |
| `mentions` | skype8 | Confirmed at 8.0 launch: "Skype 8.0 launched... with free HD video and screensharing calls, @mentions" — skype8.md source [1][5]. skype7.md explicitly leaves the "@mentions may belong at 7, not 8" question unresolved: "None of this pass's verified claims address @mentions... the new evidence did not settle it" | Matches (current choice defensible; open question genuinely still open, not upgraded to fact) |
| `read_receipts` | skype8 | "Read receipts were not part of Skype in the 7.x era; they were first introduced in a Skype Insider Preview build in September 2018" — skype7.md source [15], consistent with skype8.md's own launch-announcement text | Matches, with a more precise date than the gate needs |
| `pinned_messages` | skype8 (Phaze original) | No mention of pinning in any of the six docs' bodies | Correctly a Phaze original — no Skype equivalent found |
| `remote_control` | skype8 (Phaze original) | No mention of remote desktop control for consumer Skype in any of the six docs | Correctly a Phaze original |
| `stories` | skype8 | **Contradicted — not a Phaze original at all.** Skype's real "Highlights" feature (Snapchat/Stories-style: photo/video posts to a feed) is confirmed to exist and to have been removed: "Skype's 'Highlights' feature... let users snap a photo or video... post it for followers to view" and "In September 2018 Skype rolled back... 'ditching stories, squiggles and over-the-top color'" — skype8.md source [7]. The same doc independently confirms the redesign "reached the desktop client in August 2017" — skype8.md source [8] — **eleven months before Skype 8.0 shipped**, i.e. under the Skype 7 version number | **Gate looks too late, and the rationale is wrong** — themes.ts's comment calling Stories a thing that "never existed in real Skype" is contradicted by sourced evidence |
| `live_streams` | skype8 (Phaze original) | No livestreaming capability mentioned in any of the six docs' bodies (Skypecasts, a plausible real precedent, appear only in the older `skype-era-research.md`, not independently reconfirmed here) | No new evidence either way — Phaze-original classification stands on the six docs, but note the older doc's Skypecasts precedent |
| `spaces` | skype8 (Phaze original) | No mention in any of the six docs | Correctly a Phaze original |
| `dark_mode` | skype8 + light/dark | skype8.md's only claim about real Skype's dark mode (v8.52, ~Sept 2019) is explicitly caveated in its own body as unconfirmed: "this claim's only source... was unreachable this pass and is not confirmed" | No new evidence either way — and per `skype-era-gaps.md`'s pre-existing finding, arguably shouldn't be a gate at all |

---

## b. Concrete corrections for a developer

1. **Move `edit_message` from `skype8` to `skype3`.** skype3.md documents "Edit chat messages" as a new feature in Skype 3.2 (build 3.2.0.163, 2007), sourced to AfterDawn's version-history page — skype3.md source [3]. This is the single largest dating error in the current table: five whole eras (3 through 7) currently hide a feature that shipped in the very first one.

2. **Move `delete_message` to at least `skype7`, pending firmer sourcing.** skype7.md's verified body states Skype lets users "remove or edit individual messages during one hour after sending" (Wikipedia's List of Skype features) — skype7.md source [11]. The claim is undated/generic rather than version-pinned the way `edit_message`'s AfterDawn citation is, so treat this as a floor (move it off `skype8`) rather than a confirmed exact origin version.

3. **Fix the `stories` gate and the code comment that justifies it.** The real Skype analog — "Highlights" — shipped under the Skype 7 version number (reached desktop August 2017) and was removed in September 2018, before Skype 8.0 had been out even two months — skype8.md source [7][8]. Either move `stories` to `skype7`, or if the app deliberately wants "Stories" to mean something closer to the *removed* state (i.e., absent), the themes.ts comment claiming Stories "never existed in real Skype" needs to be corrected — it did, briefly, and its removal is exactly as dateable as its arrival.

4. **Downgrade confidence on `reactions`, don't just leave it as-is silently.** skype8.md's Differences section states plainly that the verified evidence "contains no claim that message-level reactions shipped with 8.0 or at any later specific date." The only sourced "reactions" in the whole six-doc corpus are 2017-18 Highlights reactions (a different, removed surface). Keep the gate if you like — modern Skype almost certainly did ship message reactions eventually — but the code comment currently states it as settled fact ("Skype 8+ — reactions... — all at launch"), which this pass could not source.

5. **Add a "paid/limited" note to `screen_share`'s Skype-4 gate.** skype4.md source [4]: screen sharing "was originally a premium feature" (capped, "up to 10 other people"), only free "in 'summer 2014.'" The current boolean gate makes it look free from the moment Skype 4 unlocks, which overstates its historical availability for roughly five years.

6. **Add the same note to `group_video`'s Skype-5 gate.** It went from a free 5-person beta (May 2010) to a paid Skype Premium feature ($4.99/day, $8.99/month) from January 2011 through April 28, 2014 — skype5.md source [2][17], reaffirmed at skype6.md source [3]. It was free again only by the time Skype 7 launched later in 2014. A cosmetic "Premium" badge on this feature for the `skype5` and `skype6` themes would be more accurate than treating it as free the instant it unlocks.

7. **Drop `dark_mode` from the Feature list, or stop treating it as an era gate.** `skype-era-gaps.md` already flagged this as "meaningless as a gate; each era's palette decides its own darkness." This pass reinforces it from the other direction — the one source found for when real Skype got dark mode (v8.52, ~Sept 2019) was itself unreachable and is explicitly not confirmed in skype8.md's own body. There is no sourced date to gate on even if you wanted one.

8. **Correct the precision, not the era, on `read_receipts`.** No code change needed — skype7.md source [15] pins the actual date more precisely (a September 2018 Skype Insider Preview build) than the current comment's "summer 2018."

---

## c. Real Skype capabilities with no Feature in themes.ts at all

| Capability | Era(s) documented | Citation | Worth modeling? |
|---|---|---|---|
| Group chat role/command system (Creator/Master/Helper/User/Listener, `/add`, `/kick`, `/setrole`, `/showmembers`, allow/ban lists, `/poll`) | 4.x–8.x, continuously | skype4.md [6], skype6.md [10], skype7.md [12], skype8.md [10] | Partially worth it — a minimal add/remove/rename/single-admin version is already built per `skype-era-gaps.md` #3; the full 5-tier hierarchy and `/poll` are a reasonable stretch goal, not a must, for a hobby recreation |
| Contact groups/categories in the contact list ("Groups panel") | 3.x, confirmed as early as build 3.0.0.214 | skype3.md [3] | Worth it — small, era-appropriate, currently entirely absent |
| Real presence-status variety (Online/Away/DND/Invisible/Offline/Blocked/Unauthorized/Forwarding/Connecting, plus era-specific SkypeMe/Not Available) | 4.x–8.x | skype4.md [5], skype6.md [11], skype8.md [9] | Worth it — high visual payoff (a real status picker per era, with SkypeMe/Not Available correctly vanishing at Skype 5) for comparatively low effort |
| Hidden/undocumented emoticons (`(drunk)`, `(smoking)`, `(mooning)`, the 6.14 Marvel-themed batch pulled by 6.20, `(oliver)`/`(soccer)` at 5.9, etc.) | 5.x–6.x | skype5.md [10][20], skype6.md [9] | Worth it as a low-effort nostalgia layer, not a core feature |
| Native call recording (added Sept 2018: plus-icon "Start recording," MP4 output, 30-day server storage, "call is being recorded" banner to all participants) | 8.x | skype7.md [17] (absence through 7.x), skype8.md [1][5] (arrival) | Worth it for `skype8` specifically — it's a genuinely visual, dateable capability with no current representation |
| Skype Premium / paid-feature history (screen share, group video, group screen share were each paid for years) | 4.x–6.x | skype4.md [4], skype5.md [2][3][17][18], skype6.md [3] | Cosmetic-only if modeled (a "Premium" badge) — not worth full payment plumbing for a hobby project |
| SMS-from-Skype (chat input literally offered a "Type an SMS here" field) | 7.x | skype7.md [8] | Out of scope — same bucket as the paid telephony layer (SkypeOut/SkypeIn) the project deliberately excludes |
| File-transfer size caps that changed by era (100MB from ~2016, raised to 300MB July 2016) | 7.x | skype7.md [13][14] | Minor/optional — cosmetic detail, low priority |
| Windows 8 "Metro"/Modern companion app (Charms-bar settings instead of Tools > Options, home-screen conversation strip, full-screen chat with a back arrow, no call recording) | 6.x | skype6.md [8] | Out of scope — a whole alternate per-platform UI, larger than the project's one-UI-per-era model |
| Enterprise/Group-Policy admin settings layer (registry-based policies: `DisableFileTransferPolicy`, `WebStatusPolicy`, memory-only mode, proxy policy, etc.) | 3.x onward | skype3.md [4] | Out of scope — IT-admin tooling, invisible to an end user |
| Network-level anti-detection change (Skype 3.0 altered UDP packet framing to defeat network filters) | 3.x | skype3.md [6] | Out of scope — infrastructure trivia, not a UI feature |

---

## d. Most consequential findings

Ranked by how much each would change what actually shows up on screen.

1. **`edit_message` belongs at Skype 3, not Skype 8.** AfterDawn's changelog dates "Edit chat messages" to build 3.2.0.163 (2007) — skype3.md source [3]. This is the single biggest gating error found: five of six classic eras currently hide a feature the sourced record says they had.
2. **`stories` is not a "Phaze original" — the app's own code comment is wrong.** Real Skype shipped "Highlights," a genuine Stories-style feature, under the Skype 7 version number in August 2017, eleven months before Skype 8.0 existed, and walked it back in September 2018 — skype8.md source [7][8].
3. **`reactions`, and to a lesser extent `edit_message`/`delete_message`, were assumed to have shipped together at the Skype 8.0 launch — the new pass found no evidence any of that grouping is true for reactions specifically.** skype8.md's own Differences section says as much directly.
4. **`screen_share` and `group_video` were paid Premium features for years after the app currently shows them as simply free.** Screen sharing stayed paid/capped through most of the 4.x-6.x window; group video was Premium-only from January 2011 to April 2014 — skype4.md [4], skype5.md [2][17], skype6.md [3].
5. **`delete_message` has real, if weaker, evidence of predating Skype 8** via the same Wikipedia one-hour edit/remove claim cited in skype7.md source [11] — worth at least moving off `skype8`.
6. **Mojis' Skype-7 dating has zero corroboration in the new source-verified pass.** It's not contradicted, but the confidence behind it should drop — the only support is the older, non-verified `skype-era-research.md`.
7. **Presence-status variety (SkypeMe, Not Available, Invisible, DND, Blocked, Unauthorized, Forwarding, Connecting) is fully documented per era and entirely unmodeled** — skype4.md [5], skype6.md [11], skype8.md [9]. Likely the highest visual-payoff-per-effort item in this whole report.
8. **`dark_mode` as a gate is doubly unsupportable** — already called "meaningless" in `skype-era-gaps.md`, and this pass couldn't even source when real Skype got a dark mode (its one source was unreachable). Drop it rather than try to date it.
9. **Contact groups ("Groups panel") are confirmed as early as Skype 3.0.0.214 (2007)** — skype3.md [3] — a small, real, currently-absent piece of the earliest era's UI.

---

## Where the six docs disagree with each other

No direct contradiction between two era docs was found. The closest thing to
a disagreement is a chronology mismatch rather than a factual clash: the
group-video participant-cap story is told slightly differently across
skype5.md (5-person beta in May 2010, then "up to nine other people" per a
single Computerworld source at the October 2010 general release) and
skype6.md/skype8.md (10-person free tier from April 2014 onward) — skype5.md
itself flags the October 2010 figure as "Unresolved (not confirmed, not
refuted)" rather than asserting it as settled fact, so this isn't a
cross-doc conflict, just an acknowledged single-source figure.
