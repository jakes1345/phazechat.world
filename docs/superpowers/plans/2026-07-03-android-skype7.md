# Android Skype 7 Rebuild — shipped

**Goal:** Bring the Skype 7 chrome and the web phase's features (presence,
mood, contacts, emoticons, classic call screen) to the Kotlin/Compose
Android app, and repair the app's broken `status_update` usage against the
deployed server.

**Architecture:** MVVM — `PhazeViewModel` (MutableStateFlow + SharedPreferences
`phaze_prefs`) over `NexusClient` WS. Chrome swaps in `MainActivity` when
`theme == "skype7"` (default); new UI lands as new composables beside the
existing screens. Calls stay on native WebRTC (`CallManager`, org.webrtc
renderers) — restyle only.

**Tech Stack:** Kotlin, Jetpack Compose + Material 3, Gradle (`./gradlew`
in `android/`, SDK per `local.properties`), JUnit 4 (added by this plan —
repo had no JVM tests before it).

**Spec:** `docs/superpowers/specs/2026-07-03-android-skype7-design.md`

## Global constraints that shaped the implementation

- Free/open-source assets only; no Microsoft-owned art or sounds.
- No Skype/Microsoft references in source beyond the existing `skype7`
  theme key.
- Wire format stays plain text (`(wave)`, `:)`); emoticons render at
  display time.
- Status strings exactly: `Online`, `Away`, `Do Not Disturb`, `Invisible`
  (settable), `Offline` (derived). Server validates `status_update` and
  rejects anything else.
- Skype 7 chrome gated on `theme == "skype7"`; other themes keep the
  Material shell.
- Android has no Live screen, so the tab strip is three tabs — Recent
  (clock) / Contacts (person) / Spaces (#). Settings moved to the header
  gear; the spec's "red dot Live" line doesn't apply to Android.

## Known code landmarks (verified 2026-07-03 — re-grep before editing)

- `android/app/src/main/java/world/phazechat/app/` is the source root
  (package `world.phazechat.app`).
- `data/PhazeViewModel.kt` (1659 lines): prefs = `phaze_prefs` (line ~75);
  state pattern `private val _x = MutableStateFlow(...); val x = _x.asStateFlow()`;
  `updateProfile` ~:733 sends the bad `status_update` with mood text;
  login-success block ~:1095-1110 sends `presence` with hardcoded
  `"Online"` (a second site ~:1155); `"update_result"` case ~:1208,
  `"profile_update"` ~:1214, `"friend_status", "presence"` ~:1225; `_theme`
  ~:265 (default `"skype7"`).
- `MainActivity.kt` ~:447-465: `var tab by remember { mutableIntStateOf(0) }`
  + `Scaffold(bottomBar = { NavigationBar { 3 items: Chats/Spaces/Settings } })`.
- `ui/ChatsScreen.kt` (292 lines): friends list rows; receives
  `friends: Map<String, FriendInfo>`.
- `ui/ChatScreen.kt` (393 lines): top bar with back/call/video/menu
  `IconButton`s ~:90-120; compose bar with attach ~:150 and
  `Icons.AutoMirrored.Filled.Send`.
- `ui/CallScreen.kt` (221 lines): props include `callStatus: String`
  (`"connected"` = active), `isIncoming`, WebRTC `VideoTrack`/`EglBase`.
- `ui/Theme.kt:56` `Skype7Colors = lightColorScheme(...)`, selected at :114.
- `data/NexusMessage.kt`: has `mood`, `status`, `body`, `displayName`,
  `supporter` fields; JSON via manual `put`/`str` mapping.
- `FriendInfo(username, status, mood, supporter)` in
  PhazeViewModel.kt:~30-35.
- `PhazeFCMService.kt`: push notifications via `NotificationCompat` (~:64).

---

## What shipped

**Task 1 — Protocol repair + status state** (`PhazeViewModel.kt`). Added
real `myStatus: StateFlow<String>` + `setStatus()`/`dnd` backed by the
`my_status` pref, a `status_result` handler that reverts on server
rejection, and fixed `updateProfile` (it had been sending mood text as a
`status_update`, which is what broke the live server integration). Login
and presence sends now report the real status instead of hardcoded
`"Online"`.

**Task 2 — Emoticon tokenizer** (`ui/Emoticons.kt`, TDD). Added
`EMOTICONS`/`tokenize()` mirroring `web/src/emoticons.ts` (same 20 ids,
shortcuts, longest-match-wins parsing, URLs left untouched). First JVM
unit tests in the repo (`EmoticonsTest.kt`, added `junit:junit:4.13.2`).

**Task 3 — Presence + status picker** (`ui/Presence.kt`). Hand-drawn
`PresenceBadge` (no third-party art) for Online/Away/DND/Offline, plus a
`StatusPickerSheet` bottom sheet. DND now suppresses FCM notification
pings in `PhazeFCMService` (data still syncs over WS when the app opens).

**Task 4 — Skype 7 chrome** (`ui/Skype7Chrome.kt`). Classic blue header
(avatar + presence + mood line + settings gear) and a three-tab strip
(Recent/Contacts/Spaces, hand-drawn glyphs) replacing the Material bottom
nav when `theme == "skype7"`. Other themes keep the original shell.

**Task 5 — Contacts + recent bands** (`ui/ContactsTab.kt`,
`ChatsScreen.kt`). Alphabetical contacts list with online-first sort,
section headers, presence badges and mood subtitles. Recent-chat list
grouped into Today/Yesterday/date bands.

**Task 6 — Emoticons in chat** (`ui/EmoticonUi.kt`, `ChatScreen.kt`).
Hand-drawn `EmoticonGlyph` per id (20 faces, same house style as the web
set), `EmoticonText` for inline rendering in message bubbles, a picker
panel in the compose bar, and a blue "Send message" pill replacing the
arrow icon under the skype7 theme.

**Task 7 — Call screen restyle** (`ui/CallScreen.kt`). Teal gradient
background, wordmark watermark, centered peer avatar/name/status for the
ringing/connecting state, and a dark rounded control-bar pill (green
answer, red hang-up). All WebRTC logic and renderers unchanged — chrome
only.

**Task 8 — Build/test gate.** `./gradlew assembleDebug testDebugUnitTest`
green; device install/hand-check left to whoever has a device attached.
