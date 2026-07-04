# Phaze Platform Deep Audit — 2026-07-03

Method: enumerated every WS message type the server handles (~90) and every HTTP
route (~40), then checked each subsystem's real presence in the web client,
Android client, and desktop shell by reading the handlers, not the marketing.

## Cross-client feature matrix

| Subsystem | Server | Web | Android | Desktop (Wails/web) |
|---|---|---|---|---|
| DMs + E2EE | yes | yes | yes | yes |
| Group chats (`convo_*`) | yes | **half-broken** (see B1) | **absent — zero handling** | inherits web |
| Spaces / channels | yes | yes | yes | yes |
| Live streams (`stream_*`) | yes | yes | **absent** | yes |
| Voice rooms (`voice_*`) | yes | **stub** (VoiceRoom.tsx is 804 bytes) | absent | stub |
| Remote control | yes | yes | absent | yes |
| Stories | yes | yes | yes | yes |
| Presence / mood / DND | yes (new) | yes (new) | yes (new) | yes |
| Emoticons | n/a | yes (animated) | yes (static) | yes |
| File send (`/api/v1/upload`) | yes | yes, bubble-style | send + render | yes |
| Typing indicators | yes | yes | yes | yes |
| Read receipts | yes | minimal | yes (✓/✓✓) | minimal |
| Edit / delete / react | yes | yes | yes | yes |
| Blocks / report | yes | yes | yes | yes |
| 2FA, key backup, sessions | yes | yes | yes | yes |
| Settings sync (`settings_get/set`) | yes | yes | **absent** | yes |
| Skype history import | yes | yes | absent | yes |
| Push | VAPID + FCM | VAPID | FCM | none (tray stub) |
| Avatars | **GET only** | letter circles | letter circles | letter circles |
| Call history | **nothing stored** | none | none | none |
| PSTN bridge | disabled stub (by design) | — | — | — |

## Broken or half-built (B-list)

- **B1 — Web group chats drop live messages.** Incoming `convo_msg` is written
  to `convoLogs`, a state map nothing reads (confirmed write-only during the
  build fix on 2026-07-03). Messages likely only appear via `convo_history`
  replay on open. Also: group messages are **plaintext** — no E2EE on the
  `convo_msg` path (DM-style NaCl boxes don't extend to groups without
  per-member fan-out).
- **B2 — No avatar upload path.** `/api/v1/avatars/` serves `avatars/<user>.png`
  off disk with a default fallback; nothing ever writes those files. The
  admin-served `assets/` dependency is also cwd-relative (404s if the server
  runs from the wrong dir).
- **B3 — Android Recent isn't recent.** `FriendInfo` has no last-message
  timestamp; the tab sorts online-first alphabetical.
- **B4 — Calls leave no trace.** No call table server-side, no missed-call
  entries, no log UI anywhere. Classic Skype's Recent was half call events.
- **B5 — Desktop tray is a no-op on Linux** (`startTray() {}` stubs), so no
  minimize-to-tray or unread badge.
- **B6 — Dead anonymous registration** in the web client: the server's
  disposable-email check rejects empty emails, so the `register_result: ok`
  no-email branch is unreachable (found during e2e verification).
- **B7 — Read receipts asymmetric**: Android renders ✓/✓✓, web barely surfaces
  them.
- **B8 — Android in-app notification sound path unverified for DND** — FCM is
  gated (2026-07-03); whatever sound the in-app WS path plays should be checked
  on-device.

## Absent classic features (A-list)

Profile pictures, call history/log, video messages, voicemail, contact
categories/groups, echo-test call service, birthday reminders, away
auto-replies. (PSTN "Call phones" intentionally out — no telephony lane.)

## Approved next arc (2026-07-03, ordered)

1. **Profile pictures** — upload endpoint (auth'd, size/type-capped, reuse
   `/api/v1/upload` plumbing or a dedicated `/api/v1/avatars` POST), crop UI,
   avatar display replacing letter-circles across web/Android/desktop, cache
   headers.
2. **Android group chats + fix B1** — full convo parity on Android; wire web's
   live `convo_msg` into the rendered log; document the plaintext caveat in
   the group UI until group E2EE lands.
3. **Real Recent + call history (B3 + B4)** — last-message timestamps on convo
   rows both clients; server call log (caller, callee, start, duration,
   outcome) with missed-call rows in Recent.
4. **Inline media + file UX** — image bubbles render inline (web + Android),
   drag-drop upload on web, upload progress.

Each chunk gets its own spec → plan → loop cycle, same as the web and Android
phases.
