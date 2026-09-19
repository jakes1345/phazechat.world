# Skype 7 Web UI Completion — shipped

**Goal:** Close the remaining gaps between the web app's `skype7` theme and
the Skymu pixel reference: presence states, mood messages, sidebar
overhaul (Contacts tab, date-grouped Recent, bottom rows), emoticons +
compose bar, and Skype-7-style call screens.

**Architecture:** New features landed as new components (`ContactsView.tsx`,
`EmoticonPicker.tsx`, `CallScreen.tsx`, …) wired into `web/src/App.tsx`,
following the existing `Spaces.tsx`/`Settings.tsx` pattern. One small Go
change set in `nexus_server` for status persistence and invisible masking.
Messages stay plain text on the wire; emoticons render at display time
only.

**Tech Stack:** React 18 + TypeScript + Vite (web, tests via `vitest`), Go
+ SQLite (nexus_server), Jitsi iframe for active calls.

**Spec:** `docs/superpowers/specs/2026-07-03-skype7-web-completion-design.md`

## Global constraints that shaped the implementation

- Free/open-source assets only; no Microsoft-owned Skype art or sounds.
- No Skype/Microsoft references in source; the theme key `skype7` is the
  only exception.
- Wire format for messages stays plain text (`(smile)`, `:)`) so
  Android/desktop degrade gracefully.
- Status strings are exactly: `Online`, `Away`, `Do Not Disturb`,
  `Invisible` (user-settable) and `Offline` (derived).
- Skype-7 look changes are gated on `theme === 'skype7'` (JSX) /
  `.app.theme-skype7` (CSS) unless a task says otherwise.
- Pixel reference: `skymu-v0.4-chat.png` and `skymu-v0.4-call.png` from
  TheSkymuTeam/Skymu on GitHub.

## Known code landmarks (verified 2026-07-03 — re-grep before editing, files shift)

- `nexus_server/ws_handlers.go` — `case "status_update"` (~line 271): sets
  in-memory `client.Status`, calls `s.broadcastPresence(username, msg.Body)`.
  Originally had no validation, no persistence, no invisible masking.
- `nexus_server/ws_handlers.go` — `case "update_profile"` (~line 305):
  mood (max 140) + display_name, calls `s.broadcastProfileUpdate`.
- `nexus_server/main.go:1718` — `broadcastPresence(username, status)`
  sends `{Type:"presence", Sender, Status, Supporter}` to online friends.
- `web/src/App.tsx:424` — `friends` state: `Record<string, string>`
  username → status string, updated by `case 'presence'` handlers.
- `web/src/App.tsx:610` — theme state `'light' | 'dark' | 'skype7'`.
- `web/src/App.tsx:~355` — `CallState = { peer, type: 'audio'|'video',
  status: 'ringing'|'active', direction }`; Jitsi mounts when
  `status === 'active' && jitsiRoom`.
- `web/src/App.css:91` — `.app.theme-skype7` CSS variable block.

---

## What shipped

**Task 1 — Server: status validation, persistence, invisible masking**
(`nexus_server/presence.go`, `presence_test.go`, `main.go`,
`ws_handlers.go`, TDD). Added `validStatus()`/`publicStatus()` — the WS
contract is `{type:"status_update", body:"Away"}` in, `{type:"presence",
sender, status}` out to friends, with `Invisible` always masked to
`"Offline"`. Added a `users.status` column so status survives reconnect;
`status_update` now validates and persists instead of trusting the client
blindly; connect-time presence broadcasts load the persisted status
instead of hardcoding `"Online"`.

**Task 2 — Web: presence icons, status menu, idle-away, DND mute**
(`presence.ts`, `PresenceIcon.tsx`, `App.tsx`, TDD). Hand-drawn
`PresenceIcon` (no third-party art) for the four statuses; a status
dropdown off the me-bar; `effectiveStatus()` auto-downgrades `Online` to
`Away` after 10 minutes idle (mouse/keyboard/visibility listeners) without
ever overriding a status the user picked by hand; Do Not Disturb mutes
notification sounds/toasts (message delivery and unread counts are not
gated, only the sound/popup).

**Task 3 — Web: mood line** (`MoodEditor.tsx`, `App.tsx`). Click-to-edit
mood line in the me-bar (replacing the static status text now that
presence has its own badge), synced via the existing `update_profile`/
`broadcastProfileUpdate` path; peer moods render as a subtitle in the chat
header.

**Task 4 — Web: sidebar overhaul** (`ContactsView.tsx`, `App.tsx`). Added
a Contacts tab (alphabetical, online-first within each letter group,
presence icons + mood subtitles) alongside Recent/Spaces/Live. Recent list
grouped into Today/Yesterday/weekday/date bands. Sidebar bottom gained
"Add a contact" / "Create a group" rows and an online-count strip.

**Task 5 — Emoticon tokenizer** (`emoticons.ts`, TDD, pure module). Added
`EMOTICONS`/`tokenize()` — 20 classic shortcuts (`(smile)`, `:)`, `(wave)`,
etc.), longest-match-wins parsing, URLs left untouched.

**Task 6 — Compose bar + rendering** (`EmoticonPicker.tsx`,
`emoticonArt.tsx` stub, `App.tsx`). Picker popover off the compose bar;
`MessageBody` helper renders tokenized text with emoticons inline
everywhere a message body renders; Send button becomes a blue "Send
message" pill under the skype7 theme (other themes keep the arrow). The
stub `Emoticon` component renders the unicode emoji fallback and stays the
final fallback layer after Task 7.

**Task 7 — Hand-drawn animated emoticon art** (`emoticonArt.tsx`,
`App.css`). Replaced the stub with hand-drawn inline-SVG faces for all 20
ids (consistent house style: `#FFD764` face, `#B98A00` stroke, `#5B4300`
features), a couple with small CSS keyframe animations (wave hand, heart
pulse, falling tear, etc.), all respecting `prefers-reduced-motion`. Added
an in-house-art credit line to Settings → About.

**Task 8 — Skype 7 call screens** (`CallScreen.tsx`, `call.css`,
`App.tsx`). Teal radial-gradient ring/connecting screen (avatar, name,
"calling…" dots for outgoing, "incoming call" for incoming) with a dark
pill control bar (green answer / red hang-up); the Jitsi iframe mounts
inside this chrome once the call goes active, same signaling as before —
chrome only, no protocol changes.

**Task 9 — Pixel pass against Skymu.** Compared the shipped chrome
side-by-side with `skymu-v0.4-chat.png`/`skymu-v0.4-call.png` at 100% zoom
(menu bar height, me-bar spacing, tab underline style, date-header
typography, contact row density, compose bar proportions, call screen
gradient/bar placement) and fixed real mismatches only.

Every task landed with `cd web && npx vitest run && npm run build` (and,
for Task 1, `cd nexus_server && go test ./...`) green.
