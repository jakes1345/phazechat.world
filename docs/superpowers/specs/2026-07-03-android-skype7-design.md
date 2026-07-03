# Android Skype 7 Rebuild — Design

Date: 2026-07-03
Status: approved (user AFK — recommended options taken; flagged for review: mobile look = classic-phone adaptation, emoticons = static vectors first)
Pixel reference: Skymu v0.4 screenshots for palette/feel; phone layout follows the classic Skype-for-Android era (blue header + tab strip), not the desktop chrome.
Predecessor: `2026-07-03-skype7-web-completion-design.md` (shipped; server protocol is the one deployed today).

## Goal

Phase 2 of the UI rebuild: bring the Skype 7 look and the web phase's features
(presence states, mood, contacts view, emoticons, classic call screen) to the
Kotlin/Compose Android app, and repair the app's now-broken protocol usage.

## Constraints

- Free/open-source assets only; no Microsoft-owned art or sounds.
- No Skype/Microsoft references in source beyond the existing `skype7` theme key.
- Code and commits read as hand-written; no AI attribution.
- Messages stay plain text on the wire (`(wave)`, `:)`); rendering is display-time.
- Status strings exactly: `Online`, `Away`, `Do Not Disturb`, `Invisible` (settable), `Offline` (derived) — server validates.
- Skype 7 chrome is gated on `theme == "skype7"` (the default); other themes keep the Material 3 shell.
- Existing call/WS logic (`CallManager`, `NexusClient`) is restyled around, not rewritten.

## 1. Protocol repair (PhazeViewModel)

- `updateProfile` currently sends `status_update` with the *mood text* as body
  (PhazeViewModel.kt:737) — the deployed server rejects that with "Unknown
  status". Remove it; `update_profile` alone is correct (server broadcasts
  `profile_update`).
- Key-handoff `presence` replies hardcode `status = "Online"` (~:1102, :1155).
  Send the user's current status instead.
- New: `myStatus` state + `setStatus(s)` — validates against the four statuses,
  sends `{type:"status_update", body:s}`, persists to SharedPreferences,
  re-announces after login. `status_result` with an error reverts and surfaces
  a toast/snackbar.
- DND (`myStatus == "Do Not Disturb"`): suppress in-app notification sounds and
  local notification pings while the app runs. (FCM server-side push is
  unchanged — the server already knows the status; out of scope to gate it.)
- No idle-auto-away on mobile: phones lack the desktop idle idiom. Documented
  decision, not an omission.

## 2. Chrome (MainActivity, skype7 theme only)

- Replace the Material bottom `NavigationBar` with:
  - **Header bar**: Skype blue `#00AFF0`; avatar with presence badge, username,
    tappable mood line beneath ("Share what's on your mind…" when empty),
    settings gear at the right.
  - **Tab strip** under the header: four icon tabs — clock (Recent, default),
    person (Contacts), `#` (Spaces), red dot (Live) — white underline on the
    active tab, same hand-drawn icon designs as the web.
- Other themes keep the existing bottom NavigationBar untouched.

## 3. Recent + Contacts

- **Recent** (ChatsScreen): rows gain a presence badge and a mood subtitle;
  list gets date-group bands (`Today`, `Yesterday`, weekday, else date) from
  each conversation's last-message time, band style per Skymu (normal case,
  soft gradient strip).
- **Contacts** (new `ContactsTab` composable): alphabetical with letter
  headers; online contacts before offline within each letter; presence badge +
  mood per row; tap opens the DM.

## 4. Presence + mood UI

- `PresenceBadge(status, size)` composable — green check / yellow clock /
  red minus / gray x, drawn as Compose vectors matching the web's SVGs.
- Tapping the me-bar presence badge or status text opens a bottom sheet listing
  the four statuses with badges; picking one calls `setStatus`.
- Tapping the mood line opens an inline edit (text field, 140 cap, save/cancel);
  saves via `update_profile` preserving display name.
- Peer mood shows under the peer's name in the chat top bar.

## 5. Emoticons

- `Emoticons.kt`: Kotlin port of the web tokenizer — same 20-entry shortcut
  table, longest-match-first, URLs untouched, unknown `(word)` stays literal.
  Unit-tested with the same six cases as the web suite.
- `EmoticonText` composable: renders a message string with inline emoticon
  images via `InlineTextContent`; falls back to unicode glyph for unmapped ids.
- Art: 20 static Compose/XML vector faces in the web set's house style
  (`#FFD764` face, `#B98A00` rim, `#5B4300` features). Animation is a later
  pass, deliberately.
- Compose bar: smiley button opens an emoticon grid panel (inserts the primary
  shortcut + space); send button becomes a blue **Send message** pill under
  skype7.

## 6. Call screen

- Restyle `CallScreen.kt`: full-bleed teal radial gradient (#1D5F7A → #0C2C3B),
  faint "phaze" wordmark, centered square avatar + name + "calling…" animated
  dots, dark rounded bottom bar — green answer (incoming) and red hang-up.
  All call behavior (CallManager, Jitsi handoff) unchanged.

## 7. Error handling

- `status_result` error → revert status, snackbar.
- `update_result` error → revert mood, snackbar.
- Emoticon id with no art → unicode glyph → raw shortcut text.

## 8. Testing

- JVM unit tests: tokenizer (six web-parity cases), status validation/revert.
- `./gradlew assembleDebug` green per task (ANDROID_HOME per `local.mk`:
  `/home/jack/Android/Sdk`).
- Final pass: install/run on emulator or device if available; otherwise
  screenshot review is deferred to the user's device.

## Build order

1. Protocol repair (fixes live breakage first).
2. Presence + status picker + DND.
3. Chrome: header + tab strip.
4. Recent bands + ContactsTab + mood editor.
5. Emoticons (tokenizer → art → picker → compose bar).
6. Call screen restyle.

Each step compiles and ships as its own commit.
