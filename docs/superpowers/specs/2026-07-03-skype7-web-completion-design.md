# Skype 7 Web UI Completion — Design

Date: 2026-07-03
Status: approved
Pixel reference: Skymu v0.4 screenshots (github.com/TheSkymuTeam/Skymu — `Images/skymu-v0.4-chat.png`, `Images/skymu-v0.4-call.png`). Re-download before pixel work; do not match from memory.

## Goal

Close the remaining gaps between the Phaze web app's `skype7` theme and the Skymu
reference: sidebar structure, presence states, mood messages, compose bar with
emoticons, and call screens. Web only — Android and desktop come later per the
rebuild order.

## Constraints

- Free/open-source assets only. No Microsoft-owned Skype art or sounds.
- No Skype/Microsoft references in source (theme key stays `skype7`, nothing new).
- Code, commits, and UI copy read as hand-written.
- New features land as new components (the `Spaces.tsx` / `Settings.tsx` pattern),
  wired into `App.tsx`. Extract existing code only where already being touched.
- Messages stay plain text on the wire so Android/desktop degrade gracefully.

## 1. Sidebar

**Me-bar** (already at sidebar top): avatar gains a presence badge reflecting the
user's chosen status. Under the display name, a mood line — italic gray when
empty ("Share what's on your mind…"), click to edit inline, Enter saves, Esc
cancels. Saves through the existing WS `update` handler (server already stores
`mood`, 140-char cap). Peer moods show in Contacts rows and the chat header.

**Tab row** — four hand-drawn SVG icon tabs:

| Tab | Icon | View |
|-----|------|------|
| Contacts | person | new `ContactsView` |
| Recent | clock | existing DMs view (default) |
| Spaces | # | existing |
| Live | red dot | existing |

**Contacts view** (`ContactsView.tsx`): alphabetical friend list, presence icon +
name + mood snippet per row. Click opens the DM. Online contacts sort above
offline within each letter group.

**Recent view**: conversation list gains date-group headers (`Today`,
`Yesterday`, weekday name for the past week, full date older) and a per-row
presence icon (group icon for group chats).

**Sidebar bottom**: "Add a contact" and "Create a group" buttons (reuse the
existing modals), then an "N people online" strip counting friends currently
online. Skymu's "Call phones" row is skipped — no PSTN.

## 2. Presence states

**Server** (`nexus_server`): `status` column on `users`
(`online` | `away` | `dnd` | `invisible`, default `online`). New WS message
`set_status`. Presence broadcasts to friends include the status. `invisible`
is reported to others as offline; the user still sees everything.

**Web**: clicking the me-bar presence badge opens a status menu — Online,
Away, Do Not Disturb, Invisible — with Skype-7-style icons (green check,
yellow half-moon/clock, red minus, gray x), hand-drawn SVG. Away auto-sets
after 10 minutes idle (mouse/key/visibility) and reverts on activity, never
overriding a manually picked Away/DND/Invisible. DND suppresses notification
sounds and toasts. Presence icons render identically in Contacts rows, Recent
rows, and the chat header.

## 3. Compose bar + emoticons

- `skype7` theme: send arrow becomes a blue "Send message" pill; smiley button
  sits left of the input.
- `EmoticonPicker.tsx`: grid popover above the smiley button. Hovering shows
  the shortcut text. Click inserts the shortcut into the input.
- Wire format is plain text — `(smile)`, `(wave)`, `:)` etc. Rendering
  converts shortcuts to emoticon images at display time only.
- Asset layers: (1) hand-drawn animated set (CSS/APNG) for the ~20 classics —
  smile, laugh, wink, cry, wave, heart, kiss, cool, angry, surprised, blush,
  tongue, sad, sweat, party, sleepy, thinking, thumbs up/down, hug; (2) bundled
  open-licensed static set (Twemoji, CC-BY 4.0) for the rest of the picker;
  (3) unicode passthrough for anything unrecognized. Attribution goes in
  Settings → About.
- `emoticons.ts`: shortcut table + tokenizer. Unit-tested. Tokenizer never
  touches URLs or code spans, and unknown `(word)` sequences stay literal text.

## 4. Call screens

`CallScreen.tsx` replaces the bare ring UI for `skype7`:

- **Outgoing**: full-bleed dark teal gradient, centered peer avatar, name,
  "calling…" with animated ellipsis, faint "phaze" wordmark watermark top-right,
  dark rounded bottom bar — mic and camera pre-toggle, red hang-up.
- **Incoming**: same chrome, green answer + red decline, ringtone as today.
- **Active**: the Jitsi embed mounts inside this chrome once the call connects;
  our bar's hang-up ends the call through existing signaling (`call_end`), not
  just the iframe. Gradient screen shows until Jitsi finishes loading.

No changes to call signaling or Jitsi room logic.

## 5. Error handling

- Mood save failure → revert to previous mood, toast.
- `set_status` failure → revert badge, toast.
- Presence WS drop → all peers render offline until reconnect (current behavior).
- Emoticon asset that fails to load → fall back to the shortcut text.

## 6. Testing

- Unit: emoticon tokenizer (shortcuts, URLs untouched, unknown parens literal);
  presence precedence (manual beats idle-away; invisible masks as offline).
- Existing `e2ee.test.ts` untouched and passing.
- Manual: side-by-side pixel check of sidebar, chat, and call screens against
  the Skymu screenshots at 100% zoom.

## Build order

1. Presence (server + web badge/menu) — everything else renders presence.
2. Sidebar overhaul (tabs, ContactsView, date groups, bottom rows, mood).
3. Compose bar + emoticons.
4. Call screens.

Each step ships as its own commit and leaves the app working.
