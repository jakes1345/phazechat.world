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
Listed so they're a decision rather than an oversight:

* Contact groups in the contact list
* Chat commands — `/me`, `/topic`, `/alertson` and friends
* Hidden emoticons — undocumented shortcodes, genuinely part of the culture
* Per-contact notification settings (Skype 7)
* Chats opening in separate windows (Skype 7)
* Full-history search — Ctrl+F back to the beginning (Skype 7)
* Skype Translator (Skype 7)
* Quoted messages, chat media gallery, call recording (Skype 8)
* Voicemail, call quality indicators
* `Skype Me` presence, distinct from Online

The paid layer — SkypeOut / SkypeIn / Skype Credit / Skype Number — is
deliberately absent: the brief was to replace the phone-dialling side with
Discord-style calling, not to recreate it.

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
