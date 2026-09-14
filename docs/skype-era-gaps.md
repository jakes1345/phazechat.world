# What's still missing, era by era

A register of the gap between what the era themes *claim* and what the app
actually does. It exists because the claim had drifted well ahead of the
code: `hasFeature()` gates 22 features, and when audited, **11 of them
gated nothing at all**.

Some of those 11 are fine — a feature present in every era needs no gate.
The rest are listed here as real gaps rather than left looking finished.

Checked by counting `hasFeature(theme, '<name>')` call sites in `App.tsx`
against the feature list in `themes.ts`.

## 1. Declared features with no implementation

These are in the era table, so the table says a given era "has" them, but
there is nothing in the app to show or hide.

| Feature | Claimed from | Reality |
| --- | --- | --- |
| `screen_share` | Skype 4 | **Not implemented.** No in-app screen sharing. Calls are an embedded Jitsi iframe, and whatever sharing Jitsi offers is Jitsi's, not ours and not era-gated. |
| `group_video` | Skype 5 | **Not implemented.** There is no group calling of any kind — `startCall` only takes a single peer. |
| `mojis` | Skype 7 | **Not implemented.** Nothing distinguishes Skype 7's emoticon experience from any other era's. |
| `dark_mode` | all modern | Meaningless as a gate; each era's palette decides its own darkness. Should probably be dropped from the feature list. |

Features that correctly need no gate, because every era from 3 onward had
them: `text_chat`, `voice_call`, `video_call`, `file_transfer`,
`group_chat`, `group_call`, `mood`, `emoticons`.

## 2. The call window is not a recreation in any era

**This is the agreed next piece of work** — decided, not just noticed, so
it doesn't get rediscovered as a surprise later.

The single biggest gap, and the one least visible from a screenshot of the
contact list.

`CallScreen.tsx` renders a ringing state and then hands the entire active
call to **an iframe pointing at `meet.jit.si`**. So:

* The in-call UI is Jitsi's, in all six eras. It looks like Jitsi.
* `call.css` contains **zero** era-specific rules — no `.theme-skype*`, no
  `.classic-era`. One call design across 2007 through 2018.
* The ringing screen is hardcoded with a `phaze` wordmark.

Calling *was* Skype. A pixel-perfect project that recreates the contact
list and then shows a third-party conferencing UI the moment someone picks
up has recreated the quiet half.

## 3. Group chats are create-only — no management at all, in any era

Found while researching whether "group_chat" (dated to Skype 3, per the
last correction) was actually as capable as the real thing. It isn't, and
not because of era-gating — the capability is simply absent from the
whole app.

Real Skype group chats, since their earliest days, let a member:

* **Add someone to an existing group** — `/add`, and a GUI equivalent
* **Remove someone** — `/kick`
* **Grant/see roles** — `/setrole <user> ADMIN` / `MASTER`, `/showmembers`
* **Rename the group**

Checked `nexus_server/ws_handlers.go` and `web/src/GroupChat.tsx` for the
wire protocol: a group chat supports exactly two operations after
creation — `convo_msg` (send) and `convo_leave` (leave). There is no
`convo_add_member`, no `convo_remove_member`, no role of any kind, and no
rename. `createConversation()` takes a fixed member list at creation and
nothing ever changes it. The membership picker in the "New group" modal
is the *only* point in the group's entire lifetime where membership can
be set.

This is not an era-gating bug — it's core Skype functionality that was
never built, in Skype 8/light/dark included. It's the single largest gap
found in this pass, larger than any of the call-window or CSS issues,
because it's a capability gap rather than a presentation one.

**Not started. Flagging for a decision on scope** — this is a real
feature to build (add/remove member, a creator-or-admin concept, rename),
not a CSS fix, and it touches the wire protocol, the DB schema, and both
clients.

### The real thing was bigger than "add/kick/rename"

A follow-up research pass (see `skype-era-research.md`'s new chat-commands
appendix) turned up that classic Skype's group chat management wasn't a
loose handful of actions — it was a proper role system:

* **A five-level role hierarchy** — Creator, Master, Helper, User,
  Listener — with Master able to promote/demote, Listener able to read
  but not send, and a pending "applicant" state for chats that required
  approval to join
* **Chat-wide settings** — a topic, a description, posted guidelines, an
  optional password, and behavioural flags like "history visible to new
  joiners" or "topic/picture locked to admins only"
* **A ban list and an allow list**, separate from simple membership
* **`/poll`** — an inline poll command, a real dateable Skype feature in
  its own right (separate from any Phaze poll idea, if one ever gets
  built)

None of this needs to be built to close the gap — a minimal add/remove/
rename/single-admin model would already close most of the practical
distance from where the app is now (nothing) to where real Skype was.
But it's worth knowing the ceiling is a full permission system, not just
three missing buttons, when scoping how much of it to build.

## 4. Chat history retention has no model of its own

Real Skype's retention differed sharply by era and was a genuinely
user-visible policy, not an implementation detail:

* **Classic Skype** (3–7): local history, configurable retention,
  effectively "keep forever" as an option. A joiner added to a group could
  see up to 400 messages or two weeks of prior history, whichever came
  first.
* **Skype 8**: history moved to the cloud, retained ~2 years there, with
  the classic local/forever model gone.

The app has no retention model at all — `convo_history` just returns
whatever's in the database with no cap and no distinction between eras.
Given it's a self-hosted service rather than a scraped Microsoft service,
recreating the exact retention *mechanics* has no real payoff — but the
**400-message-or-two-weeks new-joiner cutoff** is a genuine, visible
behavioural difference worth having once group membership can change at
all (see #3 — right now nobody ever joins a group after it's created, so
the rule has nothing to apply to).

## 5. Era-specific UI described but not built

From `skype-era-reference.md`, where the reference shows something the app
doesn't have:

* **Skype 3** — the `Contacts` / `Call Phones` text tab strip, and the
  toolbar row (Add, Search, Conference) beneath the profile block.
* **Skype 4** — the right-hand profile pane (gender, Skype name, location,
  birthday, language), and the twin green `Call` / `Video call` pill
  buttons. Also its two-column message layout: name in the left gutter,
  text beside it, timestamp right-aligned.
* **Skype 8** — the title bar, and composer icons sitting *inside* the
  compose box rather than outside it.

## 6. Real Skype features never implemented in any era

Sourced in `skype-era-research.md` but absent from the app entirely.
Listed so they're a decision rather than an oversight. Expanded
substantially after the deep-research pass:

* Contact groups/categories in the contact list
* The full chat command layer and role system — `/me`, `/topic`,
  `/alertson`, `/setrole`, `/poll` and ~80 others. See gap #3 above; this
  is the same gap, viewed from the "what commands existed" angle rather
  than "what buttons are missing"
* Hidden emoticons — undocumented shortcodes, genuinely part of the
  culture, including the Marvel-themed batch added in 6.14 and pulled by
  6.20
* Per-contact notification settings (Skype 7)
* Chats opening in separate windows (Skype 7)
* Full-history search — Ctrl+F back to the beginning (Skype 7)
* Skype Translator (Skype 7)
* Bots — a whole category of automated contacts, group-chat-capable from
  mid-2016
* Quoted messages, chat media gallery, call recording (Skype 8)
* Message drafts, bookmarks, split view, scheduled group calls (Skype 8,
  2019)
* Voicemail, call quality indicators, a call-transfer button
* `Skype Me` presence — now dateable: hidden from the status picker at
  Skype 4, removed completely at Skype 5. Distinct from plain Online.
* Video messages (record up to 3 minutes, send to an offline contact) —
  launched February 2013, inside the Skype 6.x window
* **Mojis specifically cannot be reproduced** — they were licensed film
  and TV clips, not something a recreation can legally include. This is a
  permanent gap, not a "not built yet" one; `mojis` should probably stay
  declared-but-unimplementable rather than ever expected to close.
* The 2017-18 Highlights/Reactions/colourful redesign that briefly
  shipped under the Skype 7 version number and was then reverted — an
  entire visual sub-era with no representation in any theme. Not
  recommending it be built (it was itself a mistake Skype walked back),
  but noting it exists as a real, dateable, and currently invisible slice
  of Skype's history.

The paid layer — SkypeOut / SkypeIn / Skype Credit / Skype Number — is
deliberately absent: the brief was to replace the phone-dialling side with
Discord-style calling, not to recreate it.

## 6a. One open dating question: does `mentions` belong at Skype 7 or 8?

The 2017 Highlights-era redesign shipped @mentions under the Skype-7
version number — roughly a year before Skype 8.0 existed. Our `skype7`
theme visually targets the earlier, more commonly remembered 2014-2016
"Skype Classic" blue look rather than that 2017-18 redesign (which was
itself reverted). So there's a real argument either way, and this is
flagged rather than changed:

* Keep `mentions` at Skype 8 (current behaviour) if `skype7` means
  "Skype Classic as people remember it" — pre-redesign.
* Move it to Skype 7 if strict release-date accuracy should win
  regardless of which visual sub-era the theme represents.

Not changed in this pass — this is a decision to make, not a bug to fix.

## 7. Fixed while compiling this list

* **Two call UIs rendered at once in Skype 3, 4, 5 and 6.** One block was
  gated on `isClassicSkype(theme)` and the next on `theme !== 'skype7'`.
  Widening the first to cover every classic era left the second matching
  as well, so four eras stacked both call overlays for the whole call.
  The second is now `!isClassicSkype(theme)`.

## How to use this file

When an era is described as "done", check it here first. The rule the rest
of these docs follow applies to this one too: an unmarked gap is worse
than no list.
