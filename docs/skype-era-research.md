# Skype, era by era

Research notes for the Phaze era themes. The point of this file is to make
feature-gating a matter of record rather than memory: when we decide Skype 3
shouldn't show screen sharing, this is why.

Everything here is sourced. Where sources disagree or I couldn't confirm a
date, it says so — an unmarked guess in a reference doc is worse than no doc.

---

## The short version

| Era | Year | Shipped |
|---|---|---|
| 1.x | 2003–04 | Text chat, voice, contact list, file transfer. Windows first. |
| 2.x | 2005 | **Video calling.** eBay buys Skype for $2.5B. |
| 3.x | 2006–07 | **Extras (plugins), Skypecasts, public chats, mood messages.** "Took the basic shape the program still has." |
| 4.x | 2009 | **Screen sharing** (4.1). SILK codec. Conference calling. The controversial wide redesign. |
| 5.x | 2010 | **Group video calling** (up to 10). **Facebook integration.** Automatic call recovery. |
| 6.x | 2012 | **Microsoft account sign-in.** MSN/Windows Live Messenger retired into Skype. |
| 7.x | 2014–18 | **Mojis. Skype Translator.** Separate chat windows, per-contact notifications, full-history search. The one people fought to keep. |
| 8.x | 2018– | Electron. @mentions, reactions. **Highlights** added then removed. Bots. |

Skype itself was retired on **5 May 2025** and folded into Microsoft Teams.
The Dial Pad survives for users with paid credit.

---

## 1.x — 2003–2004

First public beta 29 August 2003. Peer-to-peer, built by the Kazaa people.

- Text chat, voice calls, contact list
- File transfer
- **SkypeOut** (calls to landlines/mobiles) and **SkypeIn** (a real number that
  rings in Skype) arrive in this window as the first paid products
- No video

### Deep-research pass — what's new below

A second research pass, going version-by-version rather than just
era-by-era, and cross-checking every claim rather than taking one source's
word. Additions are folded into the sections below rather than kept
separate, so this file stays one continuous record. Two appendices were
added at the end that didn't exist before: the full **chat command and
role system**, and **keyboard shortcuts**. Both turned out to be much
larger than expected — the command set alone is ~85 commands deep.

## 2.x — 2005

- **Video calling** lands in the 2.0 beta. This is the release that made Skype
  a household name.
- G.729 audio codec
- eBay acquires Skype for **$2.5 billion** (12 September 2005)
- **Outlook toolbar** — find and dial contacts from Microsoft Outlook
- **Ringtones and mood icons** — personalisation on the buddy list; this is
  the earliest appearance of anything mood-related, before "mood messages"
  proper arrived in 3.0
- **Audio conference calling**, per Skype's own timeline, is dated as early
  as **February 2004** — i.e. before 2.0. Worth noting because it means
  conference calls are not a 2.x feature at all, they're 1.x-adjacent. See
  the correction under "What this means for our feature gating" below.
- Linux client launches (February 2005); Mac client had already shipped
  August 2004
- **2.6 beta** (2006, technically bridging into the 3.x year): the **Live
  tab** for Skypecasts first appears here, a **browser plug-in for IE and
  Firefox** that recognised phone numbers on web pages and made them
  one-click SkypeOut-callable, **links inside mood messages**, and a
  **birthday reminder** feature

## 3.x — 2006–2007

The era our `skype3` theme targets. Beta released 8 November 2006.

- **Extras** — third-party plugins. Launched 13 December 2006; 15 million
  downloads by February 2007. Games, Last.fm music recommendation, and more.
- **Skypecasts** — live public conversations, hosted and joinable from a "Live"
  tab. Up to ~100 participants.
- **Public Chats** — themed chat rooms, joinable by link. Distinct from the
  group chat Skype already had.
- **Mood messages** — the status line under your name.
- **Skype Find** and **Skype Prime** (paid calls to experts) arrive in 3.1–3.5.
- SVOPC audio codec (3.2)
- **"Skype Me"** presence — a status meaning "I'll take calls from strangers".
  Attracted spammers and language-practice callers alike. **Hidden from the
  status picker starting Skype 4, removed completely in Skype 5** — so it's
  correctly a Skype-3-only status, and its removal date is now pinned rather
  than "later discontinued."
- **Send Money** (3.5, 2007) — send money to a contact via PayPal
- **Video in mood** / video content in chat (3.5, 2007)
- **Call transfer** — hand a call to another contact or a group (3.5, 2007)
- **Auto-redial** (3.5, 2007)
- **Skype To Go** (June 2007) — pay-as-you-go calling via a local number
- A **test-call contact is auto-added** to every new install, for mic/speaker
  calibration — worth having in onboarding
- The **on-screen SkypeOut keypad** for dialling numbers
- Adding a contact you've just called offers a **one-click "add to contacts"**
  prompt — this is the origin of what became the modern contact-request flow
- The interface itself: bigger, cleaner tabs than 2.x, and **contact cards**
  making it easier to start a call or chat directly from a contact's card

## 4.x — 2009

The wide redesign. Widely disliked at the time for the amount of screen it took.

- **Screen sharing** — Skype's own timeline dates this to **July 2009**
  ("Launches WiFi and screen sharing features"), which lines up with 4.1
  rather than the 4.0 February release; kept at 4.1 as the boundary
- SILK audio codec — in the 4.0 beta from January 2009, final 3 February
  2009; made royalty-free for third parties 3 March 2009
- Conference calling (already present well before 4.x — see the 2.x
  correction above; kept in 4.x's list for continuity but not a 4.x
  introduction)
- Improved video, up to 720p
- **The interface itself, in detail** (this is what our `skype4` theme should
  actually be recreating, and mostly isn't yet — see the gaps doc):
  - Abandoned the old two-window arrangement (a contacts window plus a
    separate conversation window) for **one dual-pane window**: contacts on
    the left, a "conversation" — Skype's word for the full history of every
    kind of contact with one person: audio, video, text, file transfers,
    all in one place — on the right
  - A **Conversations tab**, separate from the plain contact list, for
    jumping back into a recent exchange without hunting through contacts
  - Conversation windows are **detachable** into their own window via a
    button in the corner
  - The **taskbar tray icon shows a missed-event count** directly, and
    clicking it shows a stacked breakdown by type (missed calls,
    voicemails, IMs)
  - A dedicated **Video Call button** next to the plain Call button — you
    could start video-first rather than upgrading an audio call
  - Bigger, easier-to-resize video windows, both for the call in progress
    and picture-in-picture monitoring of your own camera
  - **Bandwidth manager** — degrades video resolution/frame rate before it
    touches audio quality, on a poor connection
  - **Mic/headset switching** moved into the Call menu
  - Could **search Outlook, Outlook Express and Yahoo address books** for
    contacts already using Skype
  - A **per-minute international rate checker** built into the app
  - **Report abuse** and **block a contact** as first-class actions
  - Windows-only at first; Mac and Linux lagged behind
- **4.2 (2010)**, technically over the year boundary into 5.x's year but
  still numbered 4.x:
  - **Skype Access** — pay-per-minute WiFi hotspot access (Boingo network,
    100,000+ hotspots) billed through Skype Credit; had shipped on Mac
    (2.8) first
  - **Call transfer** to a Skype contact, or out to a mobile/landline
  - A new **Call Quality Indicator** — bars that changed colour/count with
    connection quality, a dropdown for "Call Technical Info" diagnostics,
    and an end-of-call quality-rating prompt
  - Better Windows 7 taskbar/system-tray integration

## 5.x — 2010

- **Group video calling** — **beta at launch (5.0, October 2010)**, up to
  **10 participants** (per Skype's timeline the group video announcement
  itself is dated September 2010, just ahead of the 5.0 release), with the
  view automatically switching to whoever is speaking. Windows only at
  launch, which drew complaints from Mac users.
- **Skype Home** — a new dashboard/landing pane feeding mood-message
  updates from your contacts, the direct predecessor of a modern activity
  feed
- **Facebook integration** — the Facebook News Feed inside Skype; post,
  comment, like, and call or SMS Facebook friends who've listed a phone
  number on their profile, even if they don't have Skype
- **Automatic call recovery** — reconnects a call after a network blip
- **Call quality manager** — live audio/video quality gauge during a call,
  with guidance on fixing problems
- VP7 video codec (through 5.5)
- **"Skype Me" status removed completely** in this era (see 3.x/4.x above
  for the fade-out)
- **5.5 (July 2011)**: deeper Facebook tie-in — see Facebook friends'
  online status and IM them directly from Skype, Mood and Facebook status
  updates kept in sync, improved video call reliability, and **~72 standard
  emoticons formalised** alongside a refresh of the hidden-emoticon set
  (see the emoticons appendix below)
- **5.8**: Facebook wall visible inside Skype, and **Facebook video calling
  to people who don't even have Skype** — done through the Facebook app,
  Skype only needed installing by the caller
- **5.9**: two more hidden emoticons, `(oliver)` and `(soccer)`

## 6.x — 2012

- **No Skype account required** — the headline 6.0 change (October 2012):
  sign in with a Microsoft account *or* a Facebook account instead
- **Microsoft account sign-in merges Messenger contacts into Skype**
- **MSN / Windows Live Messenger retired** in favour of Skype — announced
  November 2012, shut down 2013
- Six new interface languages: Thai, Croatian, Slovenian, Serbian, Catalan,
  Slovak
- Previously-created profile pictures carried over and became selectable
- Retina display support, multi-window chat
- Windows 8 / Metro design era; the Skype logo itself moved to a
  Metro-styled mark in 2012
- **6.1 (January 2013)** — Outlook integration: call any mobile or landline
  number from inside Outlook, presence and contact info surfaced on Outlook
  contact cards, IM a contact straight from the mail client, and an easier
  contact search from within Outlook itself
- **6.5 (June 2013)** — video messaging stability and notification
  improvements; and a genuine UI change worth having: **the "Contact
  Requests" box that used to sit above the contact list was removed**,
  replaced by message notifications and a popup for new incoming requests.
  This is a real, dateable behavioural difference for the contact-request
  flow between 6.0-and-earlier and 6.5-and-later.
- **6.14 (19 February 2014)** — a batch of new hidden emoticons, several
  Marvel-themed (`(blackwidow)`, `(captain)`, `(nickfury)`, `(bucky)`,
  `(shielddeflect)`), plus animal ones (`(dog)`, `(cat)`, `(sheep)`) — see
  the emoticons appendix. **The Marvel-themed ones were pulled again by
  6.20**, almost certainly over licensing.
- **Video messaging** launched **15 February 2013** (not June, corrected
  from an earlier version of this doc) on iOS/Android/Mac first, Windows
  support followed by late April 2013. Record up to **3 minutes**,
  preview/delete/re-record before sending, an envelope icon sends it, the
  recipient can watch it whenever they're next online. 20 free messages,
  then required Skype Premium ($4.99/month).

## 7.x — 2014–2018 — "Skype Classic"

The version people actually loved, and the one our reference theme targets.
Preview from October 2014, wider rollout December 2014.

- H.264 video codec
- **The redesign itself, in detail:**
  - Explicitly designed to mirror the mobile apps, for a more unified
    cross-device feel
  - **Compact Sidebar View** (View menu → Compact Sidebar View) — shrinks
    the contact list by replacing photo avatars with small presence-status
    icons
  - **Compact Chat View** (Tools → Options → IM & SMS) — a denser message
    log
  - Inline **large photo thumbnails** shown as soon as an image is sent,
    rather than as a link
  - Larger emoticons in the message stream
  - **File-type icons** for PDFs and Office documents specifically, so
    they're easy to spot while scrolling history
  - A **dual-pane view during a call** — the video/audio call stays up
    alongside the IM pane, so you can keep chatting or sharing files
    without the call taking over the whole window
- **Mojis** — short licensed clips from films and TV, used as reactions
  (announced 15 September 2015). **Cannot be reproduced in Phaze** — these
  were licensed studio content, not something a recreation can legally
  include. Left as a permanent, listed gap rather than faked.
- **Skype Translator** — the timeline here has conflicting dates across
  sources. Best reconstruction: standalone preview app opened for sign-ups
  in 2014, broader public preview **15 December 2015**; **integrated into
  the Windows desktop client October 2015** (i.e. desktop integration
  actually preceded the wider standalone preview, per Wikipedia's own
  Skype Translator article — this is a genuine source conflict, flagged
  rather than silently picking one). Started with English, French, German
  and Mandarin; Italian added ~April 2015; Russian added October 2016.
  Speech-to-speech in near-real-time, instant-message translation across
  70+ languages. A public API for third-party use shipped March 2016.
- **Bots** (from Microsoft's Build 2016 conference onward) — a whole
  category of automated contacts: travel (Skyscanner), tickets (StubHub),
  general assistance (Hipmunk). Became group-chat-capable **July 2016**
  (could reply to more than one user in the same chat), and could send
  "cards" — images with buttons, receipts, and carousels
- **Ctrl+F searched the entire history**, back to the beginning
- **Chats could open in separate windows**
- **Per-contact notification settings**
- **File sharing limit raised to 300MB** (July 2016) — this had briefly been
  capped at 100MB earlier the same year. Not an 8.x feature; corrected from
  an earlier version of this doc, which had it dated to Skype 8
- The **P2P → Azure migration completed April 2017**, invisible to users
  but the end of Skype's architecturally distinctive design, and it's also
  approximately when temporary (30-day) server-side storage of voice
  messages, video messages, file attachments and call recordings began —
  a mechanical prerequisite for several of these features, not a feature
  in its own right
- **The Snapchat-inspired 2017 redesign happened inside the 7.x/early-8.x
  window and was walked back** — worth its own note because it's a whole
  era-within-an-era that isn't reflected anywhere in our themes:
  - Announced June 2017 (mobile first), reached desktop **August 2017**
  - **Highlights** — a Stories clone: post photos/video of your day to a
    dedicated feed
  - **Reactions on Highlights** — thumbs up, heart, and faces for sad,
    surprised, laughing, angry (a Facebook-reactions clone)
  - A deliberately **colourful, gradient-heavy theme**; group chats were
    individually multi-coloured
  - **Bright squiggly lines** as the typing indicator and to mark unread
    messages
  - A **media gallery** on the right side of group chats for shared
    files/photos
  - **@mentions** arrive here, not with Skype 8 as this doc previously
    implied by omission — worth flagging since @mentions is currently
    gated to Skype 8 in `themes.ts`. See the correction note below.
  - Starting a conversation moved to a **"+" button top-left**, which also
    surfaced available bots
  - Emoji reactions could pop up as a temporary overlay **during video
    calls**, not just on messages
  - **Backlash was severe** — App Store/Play Store reviews turned hostile,
    accusations of "Snapchat envy" — and by **September 2018** Microsoft
    reversed course: Highlights and the squiggle typing indicator were
    dropped, colour was toned down, and a "Skype Classic" blue theme
    returned as an option

Microsoft announced on 1 September 2018 that Skype 7 would be shut down. The
backlash was severe enough — including a Change.org petition from professional
users — that the shutdown was delayed to November 2018.

### What 7.x did *not* have, and the app must not show in this era

- Reactions **on individual messages**, editing or deleting a sent message
- Read receipts (delivered/seen ticks)
- Message @mentions did technically exist by the tail end of 7.x's
  lifetime (2017 redesign, see above) even though they're commonly
  remembered as an 8.0 thing — flagged here rather than silently changed
  in `themes.ts`, since it's genuinely ambiguous which "Skype 7" our theme
  is recreating: the 2014 launch, or the 2017-18 redesign that shipped
  under the same major version before the Electron rewrite. Our theme
  visually targets the 2014-2016 blue look, so treating @mentions as an
  8.0 feature for gating purposes is defensible — but it's a judgment
  call, not a fact, and should be stated as one.

## 8.x — 2018 onward

Electron-based rewrite. April 2017 had already moved Skype off peer-to-peer
onto centralised Azure infrastructure.

Added at launch (16 July 2018):
- Free HD video calls and screen sharing, **up to 24 people**
- **@mentions** and emoji **reactions** (see the 7.x note above — the
  Highlights-era redesign shipped @mentions first, under the Skype-7
  version number; 8.0 is where it lands *for good*, without Highlights
  attached to it)
- **Quoted messages** — note: quoting, *not* pinning. Pinned messages
  are a Phaze original with no Skype equivalent.
- **Chat media gallery** for photos and links
- Personalised chat themes, notification panel
- **Bots**

Shipped over summer 2018:
- **Read receipts** — the reader's avatar appears beneath the message
- **Call recording**
- **Private conversations** with end-to-end encryption
- Profile invites and group links

### 8.x kept shipping for years — a year-by-year feature timeline

Skype 8 wasn't a single snapshot; it kept changing for the rest of Skype's
life. None of this is currently reflected anywhere (the app treats "Skype
8" as one static modern state), but it's worth having on record in case a
later 8.x sub-era is ever worth distinguishing:

- **February 2019** — AI background blur for video calls
- **August-September 2019** — message **drafts** (auto-saved, tagged
  `[draft]`), **bookmarks** (right-click a message → Add bookmark → a
  dedicated Bookmarks screen), **Split View** (contacts and conversations
  in separate panes), **media previews** before sending a photo/video/file,
  and **scheduled group calls**
- **May 2020** — **custom message reactions** (any emoticon usable as a
  reaction, not just the fixed set), **Grid View** for up to 10
  participants in a call, background options
- **December 2020 (8.67)** — **Together Mode** (composites participants
  into a shared virtual space, borrowed from Teams), **Large Grid Mode**,
  and **Meet Now** (a Zoom-style link-based call with no sign-up, in
  direct response to Zoom's 2020 growth)
- **February 2021 (8.68)** — background blur reaches Android
- **May–September 2021** — background blur reaches web (Edge/Chrome) and
  then all platforms; custom call reactions
- **2023–2024** — Bing/Copilot-era AI integration announced across
  Microsoft's product line generally; specifics for Skype itself are thin
  in public sources and not confirmed enough to state as fact here
- **July 2024** — ads removed from Skype on all platforms; AI image
  creation and OneAuth sign-in added around Insider build 8.125
  (August 2024)
- **28 February 2025** — Microsoft announces Skype's retirement
- **5 May 2025** — Skype officially retired; Skype credentials could sign
  into Teams (free) instead

Also:
- **Highlights** — a Stories clone added in the 2017 Snapchat-inspired
  redesign, removed in 2018 because it "didn't resonate with a majority of
  users"

Removed or broken relative to 7.x, and the substance of the backlash:
- Separate chat windows
- Per-contact notification customisation
- Full-history Ctrl+F search (initially)
- Desktop sharing, in the UWP build specifically

---

## Skype for Web

Relevant because Phaze *is* a web client, and it's worth knowing how little the
original managed.

- Announced **November 2014**; beta opened to US and UK users **June 2015**
- Sign in at web.skype.com, chat in any browser
- **Voice and video required a downloadable browser plugin** — it was not a
  pure web app
- The plugin was unavailable on Chromebooks and on Chrome for Mac
- Microsoft said WebRTC support was planned for general availability

Worth stating plainly: Phaze's web client does natively, over WebRTC, what
Skype for Web needed a binary plugin for and never fully delivered.

---

## Skype for Business (Lync) — where the whiteboard actually comes from

Consumer Skype never had a whiteboard. **Skype for Business did**, and its
design is worth copying because it was shaped by real meeting use.

- A **Whiteboard** is a shared page inside a meeting where participants draw,
  type and annotate together
- The annotation toolset sits **on the right-hand side**: pointer, pen,
  highlighter, eraser, text, shapes, stamps
- **Many people can work on it simultaneously — but each tool can only be used
  by one person at a time**
- The board can be **saved** when the meeting ends
- Alongside it: **Polls** (presenter-created, anonymous voting, results hidden
  or shown at the presenter's discretion), **Q&A**, and PowerPoint sharing

So a whiteboard in Phaze isn't an invention bolted on — it's the one genuinely
collaborative surface the Skype family ever had, moved from the business
product into the consumer one.

---

## Things easy to forget

Collected here because they came up in research and would otherwise get lost.

- **SkypeIn / SkypeOut / Skype Credit / Skype Number** — the paid layer, and
  the only part of Skype that outlived the app itself
- **Voicemail**, call forwarding, and SMS-from-Skype
- **Skype Qik** — standalone video-messaging app, autumn 2014, shut down
  February 2016 once Skype absorbed the feature
- **Skype Wi-Fi** — paid hotspot access, discontinued 2017
- **Skype Manager** — business account administration
- **Hidden emoticons** — undocumented shortcodes, a genuine part of the culture
- **Chat commands** — `/me`, `/alertson`, `/topic` and friends, from the IRC
  lineage
- **Skype Me** status, distinct from Online
- **Contact groups** in the contact list
- **Call quality indicators** during a call
- **Skype Prime** — paid calls to self-declared experts, an early marketplace
  experiment
- **P2P → Azure** — April 2017, invisible to users but the end of what made
  Skype architecturally distinctive

---

## What this means for our feature gating

`web/src/themes.ts` gates features per era. Checked against the research:

| Feature | Earliest era | Basis |
|---|---|---|
| Text chat, voice, file transfer | 3 | 1.x — long before our earliest theme |
| Video calling | 3 | 2.x, 2005 |
| **Group text chat** | **3** | Skype was designing multi-person chat in 2004; Public Chats in 3.0 are described as distinct from "the group chat Skype already had" |
| **Group audio / conference calls** | **3** | Skypecasts in 3.0 carried up to 100 people |
| Mood messages | 3 | 3.0 |
| Screen sharing | **4** | 4.1, 2009 |
| **Group video calling** | **5** | 5.0 beta, Oct 2010 — 5 participants at launch, later 10 |
| Mojis | **7** | Announced 15 Sept 2015 |
| Reactions, @mentions, edit/delete | **8** | 8.0, July 2018 — all at launch |
| Read receipts | **8** | 8.0, shipped summer 2018 |
| Stories | 8 | Skype's Highlights, 2017, removed 2018 |
| Pinned messages | 8 | Phaze original — Skype 8 had *quoted* messages, not pins |
| Remote control | 8 | Phaze original — see below |
| Spaces, livestreams | 8 | Phaze originals, no Skype equivalent |
| Whiteboard | 8 | From Skype for Business, not consumer Skype |

### Two corrections to the earlier version of this table

**Group chat was gated at Skype 5. That was wrong.** The old row read
"Group chat / group calls — 5", which conflated three different things.
Group *video* calling is the genuine 5.0 milestone; group *text* chat and
audio conferencing both predate Skype 3 entirely. The evidence was
already in this document — the 3.x section describes Public Chats as
distinct from "the group chat Skype already had" — and the table
contradicted it. Skype 3 and 4 were being denied capabilities they
really had. `group_video` is now its own feature so the 5.0 boundary is
preserved without that side effect.

**Remote control was gated at Skype 6 on an admitted guess**, and the
previous version of this file said as much. Checked: no consumer Skype
release shipped remote desktop control. "Give control" during a screen
share belongs to the Skype for Business lineage, the same place the
whiteboard comes from. Third-party tools like SkyRemote bolted it onto
Skype's API, which is not the same as Skype having shipped it. It is now
classified as a Phaze original rather than dated to a release.

### What Skype 6 actually added

Nothing that belongs in this table, and that is a finding rather than an
oversight. Skype 6's headline changes were Microsoft account sign-in and
the retirement of Windows Live Messenger into Skype — account plumbing
and a migration, not new conversation features. Its feature set is
therefore identical to Skype 5's. The era is still visually distinct
(Metro flat design), which is where its differences live.

### Participant limits over time

Worth recording since "group call" means different things by era:

| When | Limit |
|---|---|
| Skypecasts, 3.0 (2006) | ~100, moderated public voice |
| Group video, 5.0 beta (2010) | 5, later 10 |
| Skype 8 launch (2018) | 24 for HD video + screen share |
| 5 April 2019 | 50 |
| October 2020 | 100 |

### One more correction, and one open judgment call, from the deep-research pass

**Audio conference calling is not really a "Skype 3" feature either** —
Skype's own timeline dates it to February 2004, inside the 1.x window,
before video calling (2.x) even existed. This doesn't change the app's
gating (`group_call` is already at the earliest era, `skype3`, which is
the earliest era we have at all), but it means the *reasoning* in the
table above — "Skypecasts in 3.0 carried up to 100 people" — undersells
it. Skypecasts were the first-visible, large-scale, *public* form of
something that had existed in small-group form for two years already.
Recorded here so nobody re-derives "conference calling started in 3.0" as
a fact later.

**@mentions may belong at Skype 7, not Skype 8** — a genuine open
question, not a settled fact. The 2017 Snapchat-inspired redesign shipped
@mentions under the Skype-7 version number, roughly a year before Skype
8.0 existed. Our `skype7` theme visually targets the earlier 2014-2016
blue look rather than the 2017-18 colourful redesign, which was itself
reverted within Skype 7/8's shared lifetime — so there's a real argument
either way:
- **Keep @mentions at Skype 8** (current behaviour) if `skype7` is meant
  to represent "Skype Classic" as most people remember it, i.e. before
  the redesign.
- **Move @mentions to Skype 7** if strict release-date accuracy matters
  more than which visual sub-era the theme targets.

Not changed in this pass. Flagging for a decision rather than picking
silently, the same way the group-chat and remote-control corrections were
made explicitly rather than folded in quietly.

---

## Appendix: chat commands and roles

Not previously researched at all. Classic Skype (and the cloud-based
group chats through most of the product's life) ran on an IRC-derived
command layer, typed directly into a group chat. None of this exists in
Phaze currently — see `docs/skype-era-gaps.md` for the group-chat
management gap this bears on directly.

### Roles

A strict hierarchy, highest privilege first:

| Role | Notes |
|---|---|
| **CREATOR** | The person who made the chat. Fixed — `/goadmin` promotes someone to admin, described as taking on the "CREATOR" designation, but the original creator identity itself doesn't transfer. |
| **MASTER** | Full moderator privileges — the practical "admin" role for everyday use |
| **HELPER** | A junior-moderator tier below Master |
| **USER** | Ordinary member — can read and send |
| **LISTENER** | Can read but not send, until promoted |
| *(APPLICANT)* | Not a persistent role — the state a joiner is placed in when the chat has `JOINERS_BECOME_APPLICANTS` set; they're pending approval |

Set with `/setrole [Skype name] MASTER|HELPER|USER|LISTENER`.

### Membership and moderation

| Command | Does |
|---|---|
| `/add [Skype name(s)]` | Add member(s) to an existing chat |
| `/kick [Skype name]` | Remove a member |
| `/kickban [Skype name]` | Remove and permanently block from rejoining |
| `/leave` | Leave the chat |
| `/invite [Skype name]` | Invite (distinct from `/add` in some clients) |
| `/fork [Skype name(s)]` | Spin off a duplicate of the chat excluding the named members |
| `/get uri` | Generate a joinable link |
| `/whois [Skype name]` | Show a member's info and role |
| `/showmembers` | List all members and roles |
| `/showactivemembers` | List currently-online members |
| `/get creator` / `/get admins` / `/get masters` / `/get helpers` / `/get users` / `/get listeners` | List members by role |
| `/get allowlist` / `/set allowlist [[+\|-]mask]` | Manage an access allowlist |
| `/get banlist` / `/set banlist [[+\|-]mask]` | Manage a ban list |

### Chat-wide settings

| Command | Does |
|---|---|
| `/topic [text]` | Set the chat topic |
| `/set description [text]` / `/get description` | Chat description |
| `/set guidelines [text]` / `/get guidelines` | Posted chat guidelines |
| `/setpicture` | Set a group picture (removes it, per one source — behaviour may have changed across versions) |
| `/set password [text]` / `/set password_hint [text]` / `/clearpassword` / `/get password_hint` | Password-protect the chat |
| `/get options` / `/set options [[+\|-]flag]` | Toggle behavioural flags (below) |
| `/createmoderatedchat` | Start a new chat with moderation on from the start |
| `/newchat` | Start a plain new group chat |

### `/set options` flags

| Flag | Effect |
|---|---|
| `HISTORY_DISCLOSED` | New joiners can see history from before they joined |
| `JOINING_ENABLED` | Whether the chat accepts new joiners at all |
| `JOINERS_BECOME_APPLICANTS` | New joiners are pending until an admin approves them |
| `JOINERS_BECOME_LISTENERS` | New joiners can read but can't send until promoted to USER |
| `USERS_ARE_LISTENERS` | Demotes everyone at USER level to read-only |
| `TOPIC_AND_PIC_LOCKED_FOR_USERS` | Only the creator/admins can change the topic or picture |

### Everyday and utility commands

| Command | Does |
|---|---|
| `/me [text]` | Third-person status line, IRC-style |
| `/alertson [text]` / `/alertsoff` | Get notified only when specific text is mentioned |
| `/history` / `/htmlhistory` | Show / export chat history |
| `/clear` | Clear the local view of the chat (not the server record) |
| `/find [text]` | Jump to the first mention of text |
| `/undoedit` | Revert the last edit you made |
| `/info` | Show member count and the chat's capacity |
| `/showstatus` | Message count, chat ID, and similar diagnostics |
| `/showname` | Show the chat's name |
| `/golive` / `/golive [token]` | Start (or join via token) a group call from within the chat |
| `/poll [title], [option1], [option2], [option3]` | Create an inline poll — a real, dateable Skype feature, distinct from Phaze's own poll idea if one is ever built |
| `/version` | Report the Skype client version |
| `/resynccontacts` | Force a contact-list resync |
| `/nobday` | Suppress birthday notifications |
| `/wikimarkup [on/off]` | Toggle wiki-style markup rendering |
| `/resetreactions` / `/addreaction [name]` / `/removereaction [name]` | Manage the emoji reaction picker (a later, cloud-era addition) |
| `/help` | List available commands |

### Inline text formatting

| Syntax | Effect |
|---|---|
| `_text_` | *Italic* |
| `**text**` | **Bold** |
| `~text~` | ~~Strikethrough~~ |
| `{code}text{code}` | Inline monospace |
| `!! text` | Whole-line monospace |
| `@@ text` | Override/escape other formatting |

## Appendix: emoticons

- Roughly **600 emoticons total** across Skype's life, including about
  **237 flag emoticons** (one per country/nation)
- Almost all are **animated**, sized around 25×25px
- The hidden/undocumented set has a distinctly **adult sense of humour**
  compared to other IM clients of the era — `(drunk)`, `(smoking)`,
  `(mooning)`, `(headbang)`, `(bug)`, `(fubar)` and similar were present
  from **Skype 2.5/3.0** onward
- `(finger)` was removed for being offensive; exact version not
  confirmed by available sources
- **~72 standard emoticons formalised in Skype 5.5** (2011) — the
  everyday smiley set most people picture
- **5.9** added `(oliver)` and `(soccer)` to the hidden set
- **6.14 (February 2014)** added a themed batch: Marvel-branded
  (`(blackwidow)`, `(captain)`, `(nickfury)`, `(bucky)`,
  `(shielddeflect)`, `(talktothehand)`) and animal-themed (`(dog)`,
  `(cat)`, `(sheep)`, `(bike)`, `(idea)`) hidden emoticons
- **The Marvel-themed ones were removed again by 6.20** — a licensing
  issue is the likely reason, though not confirmed in primary sources

## Appendix: keyboard shortcuts

These are documented for **modern Skype (8.x)**; sources didn't confirm
equivalents for the classic (3-7) client specifically, so nothing here
should be assumed to apply before Skype 8 without separate verification.

| Shortcut | Action |
|---|---|
| `Ctrl+N` | New conversation |
| `Ctrl+G` | New group chat |
| `Ctrl+F` | Search within the open conversation |
| `Ctrl+Shift+A` | Add people to the conversation |
| `Ctrl+Shift+F` | Send a file |
| `Ctrl+P` | Show conversation profile |
| `Ctrl+Shift+L` | Multi-select messages |
| `Ctrl+Shift+E` | Archive the selected conversation |
| `Ctrl+Shift+O` | Open the notification panel |
| `Ctrl+Shift+B` | Open the bots screen |
| `Ctrl+Shift+C` | Open contacts |
| `Ctrl+Shift+T` | Toggle light/dark theme |
| `Ctrl+T` | Open themes |
| `Ctrl+,` | Open settings |
| `Ctrl+2` | Open the dial pad |
| `Ctrl+R` | Refresh |
| `Alt+2` | Open contacts |
| `Alt+Shift+E` | Focus the message composer |

---

## Sources

- [Skype — Wikipedia](https://en.wikipedia.org/wiki/Skype)
- [A Brief History of Skype](https://content.dsp.co.uk/history-of-skype)
- [Skype Unveils 3.0 — TechCrunch](https://techcrunch.com/2006/12/13/skype-unveils-30/amp/)
- [Skype 3.0: Streamlined and Enhanced](https://www.smallbusinesscomputing.com/guides/skype-3-0-streamlined-and-enhanced-for-the-new-year/)
- [Skype 5.0 for Windows Debuts — TechCrunch](https://techcrunch.com/2010/10/14/skype-5-0-for-windows-debuts-with-facebook-integration-call-recovery-and-more)
- [Skype Launches Version 5.0 with Facebook Integration](https://www.techlicious.com/blog/skype-launches-version-5.0-with-facebook-integration/)
- [Skype becomes the new Microsoft Messenger](https://www.windowscentral.com/skype-becomes-new-microsoft-messenger)
- [Skype Gets Retina-Ready, Adds Multi-Window Chat — TechCrunch](https://techcrunch.com/2012/10/24/skype-gets-retina-ready-adds-multi-window-chat-and-live-messenger-support/amp/)
- [Skype 7 Gets a Stay of Execution — Tom's Hardware](https://www.tomshardware.com/news/skype-7-vs-8-discontinued,37560.html)
- [Microsoft will end support for Skype Classic — TechCrunch](https://techcrunch.com/2018/09/27/microsoft-will-end-support-for-skype-classic-in-november/amp/)
- [Use the whiteboard to collaborate in a Skype for Business meeting — Microsoft](https://support.microsoft.com/en-us/servicing/skype/use-the-whiteboard-to-collaborate-in-a-skype-for-business-meeting)
- [How to start a Poll, Q&A, and Whiteboard in Skype for Business](https://www.thewindowsclub.com/poll-qa-and-whiteboard-in-skype-for-business-meeting)
- [Microsoft bringing Skype to a browser near you — GeekWire](https://www.geekwire.com/2015/microsoft-bringing-skype-to-a-browser-near-you-with-skype-for-web-beta/)
- [Skype For Web Beta Now Open To All U.S. And U.K. Users — TechCrunch](https://techcrunch.com/2015/06/05/skype-for-web-beta-now-open-to-all-u-s-and-u-k-users/amp/)
- [Skype Kills Its Standalone Video Messaging App Qik — TechCrunch](https://techcrunch.com/2016/02/22/skype-kills-its-standalone-video-messaging-app-qik)
- [Skype drops Highlights feature — PhoneArena](https://www.phonearena.com/news/Skype-drops-Highlights-feature-to-focus-on-calls-and-video-chats_id108396)
- [Microsoft is discontinuing the Skype Translator bot — Neowin](https://www.neowin.net/news/microsoft-is-discontinuing-the-skype-translator-bot/)

### Added in the deep-research pass

- [Timeline of Skype — timelines.issarice.com](https://timelines.issarice.com/wiki/Timeline_of_Skype) — the single
  most useful source found this pass; a dated, sourced event list from 2002
  through 2017
- [Skype 3.0 for Windows — Practically Networked](https://www.practicallynetworked.com/skype-3-for-windows/)
- [Skype 4.0 review — PC World](https://www.pcworld.com/article/527631/skype_review.html)
- [Review: Skype 4.0 for Windows — Small Business Computing](https://www.smallbusinesscomputing.com/guides/review-skype-version-4-0-for-windows/)
- [Skype for Windows 4.2: Enhancing the Skype Call Experience](https://voiceontheweb.biz/skype-world/skype-markets-skype-world/skype-for-personal/skype-for-windows-4-2-enhancing-the-skype-call-experience/)
- [Skype 5 For Windows: Review — Silicon UK](https://www.silicon.co.uk/workspace/skype-5-for-windows-review-10718)
- [Skype 5.0 for Windows busts out of beta — Engadget](https://engadget.com/2010/10/14/skype-5-0-for-windows-busts-out-of-beta-integrates-your-faceboo)
- [Skype 5.5 for Windows released — BetaNews](https://betanews.com/article/skype-5-5-for-windows-released-integrates-facebook-features/)
- [Skype 5.8 For Windows Brings Facebook Video Calling — PC World](https://www.pcworld.com/article/474156/skype_5_8_for_windows_brings_facebook_video_calling.html)
- [Skype updated with improved video messaging — The Next Web](https://thenextweb.com/news/skype-updated-with-improved-video-messaging-simplified-contact-adding-on-windows-and-easier-calling-on-os-x)
- [Skype 6 released — gHacks](https://www.ghacks.net/2012/10/24/skype-6-released/)
- [Skype 6.14 — Chat4o](https://en.chat4o.com/skype-6-14/)
- [Skype for Windows Desktop Gets Awesome Redesign — Windows Report](https://windowsreport.com/desktop-skype-windows-redesign/)
- [Skype for Windows 7.0 sports redesigned, touch-friendly interface — BetaNews](https://betanews.com/2014/12/06/skype-for-windows-7-0-sports-redesigned-touch-friendly-interface/)
- [Old features in the new Skype — skaip.org](http://www.skaip.org/old-features-in-the-new-skype)
- [Microsoft releases first wave of Skype Bots — GeekWire](https://www.geekwire.com/2016/skype-bots/)
- [Skype Chatbots Get New Features And Group Chat Support — Tech Times](https://www.techtimes.com/articles/169169/20160709/skype-chatbots-get-new-features-and-group-chat-support.htm)
- [Skype Translator — Wikipedia](https://en.wikipedia.org/wiki/Skype_Translator)
- [Skype's Snapchat-inspired makeover — TechCrunch](https://techcrunch.com/2017/06/01/skypes-snapchat-inspired-makeover-puts-the-camera-a-swipe-away-adds-stories/)
- [Skype's much-debated redesign hits the desktop — TechCrunch](https://techcrunch.com/2017/08/17/skypes-much-debated-redesign-hits-the-desktop/)
- [Skype rolls back its redesign — TechCrunch](https://techcrunch.com/2018/09/03/skype-rolls-back-its-redesign-by-ditching-stories-squiggles-and-over-the-top-color)
- [Skype 8.0 launches on desktop — TechCrunch](https://techcrunch.com/2018/07/16/skype-launches-a-new-desktop-app-with-hd-video-improved-chat-and-soon-encryption-and-call-recording)
- [Skype releases version 8 — AlternativeTo](https://alternativeto.net/news/2018/7/skype-releases-version-8-will-introduce-end-to-end-encryption-and-built-in-call-recording)
- [Skype upgrades its messaging feature with drafts, bookmarks and more — TechCrunch](https://techcrunch.com/2019/08/30/skype-upgrades-its-messaging-feature-with-drafts-bookmarks-and-more)
- [Skype Insider Update Arrives with Group Call Scheduling — WinBuzzer](https://winbuzzer.com/2019/09/02/skype-insider-update-arrives-with-group-call-scheduling-xcxwbn/)
- [Together Mode Comes to Skype — Thurrott](https://www.thurrott.com/cloud/microsoft-consumer-services/skype/245201/together-mode-comes-to-skype)
- [Skype can now blur the background during video calls — TechCrunch](https://techcrunch.com/2019/02/06/skype-video-call-blur)
- [Microsoft is now removing ads from Skype on all platforms — AlternativeTo](https://alternativeto.net/news/2024/7/microsoft-is-now-removing-ads-from-skype-on-all-platforms)
- [Microsoft hangs up on Skype, service to shut down May 5 2025 — TechCrunch](https://techcrunch.com/2025/02/28/microsoft-hangs-up-on-skype-service-to-shut-down-may-5-2025)
- [Skype file transfers limited to 100 MB — gHacks](https://www.ghacks.net/2016/05/22/skype-file-transfers-limited-100mb/)
- [Skype now allows sharing of files up to 300MB — Windows Central](https://www.windowscentral.com/skype-now-allows-sharing-files-photos-and-videos-300mb)
- [Does skypeme mode still exist? — BleepingComputer forum](https://www.bleepingcomputer.com/forums/t/476696/does-skypeme-mode-still-exist/) — source for the "Skype Me" hide/removal dates
- [85 Skype Commands — Geek Dashboard](https://www.geekdashboard.com/skype-commands/) — the chat-command appendix
- [Hidden Skype Emoticons + New Hidden Smileys in 6.14, 5.9, 5.5 — Chat4o](https://en.chat4o.com/skype-emoticons/) — the emoticons appendix
- [Every Skype Keyboard Shortcut and How to Use Them — How-To Geek](https://www.howtogeek.com/670236/every-skype-keyboard-shortcut-and-how-to-use-them/) — the keyboard-shortcuts appendix

**Sources that failed to load or returned nothing usable this pass**, so
no claims here rest on them: snapfiles.com/apphistory (503), the wiert.me
blog post on chat roles (fetched empty), oldapps.com changelog (522),
techradar's cloud-sync article (paywall/signup wall), and en.chat4o.com's
"short history" summary page (403).
