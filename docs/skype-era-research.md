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

## 2.x — 2005

- **Video calling** lands in the 2.0 beta. This is the release that made Skype
  a household name.
- G.729 audio codec
- eBay acquires Skype for **$2.5 billion** (12 September 2005)

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
  Later discontinued.

## 4.x — 2009

The wide redesign. Widely disliked at the time for the amount of screen it took.

- **Screen sharing** introduced in **4.1** — this is the era boundary that
  matters most for our feature gating
- SILK audio codec
- Conference calling
- Improved video, up to 720p

## 5.x — 2010

- **Group video calling** — beta, up to **10 participants**, with the view
  automatically switching to whoever is speaking. Windows only at launch,
  which drew complaints from Mac users.
- **Facebook integration** — the Facebook News Feed inside Skype; post,
  comment, like, and call or SMS Facebook friends.
- **Automatic call recovery** — reconnects a call after a network blip.
- VP7 video codec (through 5.5)

## 6.x — 2012

- **Microsoft account sign-in**, merging Messenger contacts into Skype
- **MSN / Windows Live Messenger retired** in favour of Skype — announced
  November 2012, shut down 2013
- Retina display support, multi-window chat
- Windows 8 / Metro design era

## 7.x — 2014–2018 — "Skype Classic"

The version people actually loved, and the one our reference theme targets.

- H.264 video codec
- **Mojis** — short clips from films and TV used as reactions (announced
  15 September 2015)
- **Skype Translator** — standalone in 2015, built into the desktop client 2016.
  13 spoken languages, 50+ in text.
- **Ctrl+F searched the entire history**, back to the beginning
- **Chats could open in separate windows**
- **Per-contact notification settings**
- **File sharing limit raised to 300MB** (July 2016) — this had briefly been
  capped at 100MB earlier the same year. Not an 8.x feature; corrected from
  an earlier version of this doc, which had it dated to Skype 8

Microsoft announced on 1 September 2018 that Skype 7 would be shut down. The
backlash was severe enough — including a Change.org petition from professional
users — that the shutdown was delayed to November 2018.

### What 7.x did *not* have, and the app must not show in this era

- Reactions on messages, @mentions, editing or deleting a sent message
- Read receipts (delivered/seen ticks)

## 8.x — 2018 onward

Electron-based rewrite. April 2017 had already moved Skype off peer-to-peer
onto centralised Azure infrastructure.

Added at launch (16 July 2018):
- Free HD video calls and screen sharing, **up to 24 people**
- **@mentions** and emoji **reactions**
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
