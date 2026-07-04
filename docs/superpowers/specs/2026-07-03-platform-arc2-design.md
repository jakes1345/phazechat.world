# Platform Arc 2 — Avatars, Groups, Call History, Inline Media

Date: 2026-07-03
Status: approved (user picked all four chunks; order locked in the audit)
Basis: `docs/superpowers/audits/2026-07-03-platform-audit.md` — fixes B1–B4 and
the top A-list absences.

## Scope, in build order

### 1. Profile pictures (fixes B2)
- **Server**: `POST /api/v1/avatars` — session-cookie auth (same middleware as
  `/api/v1/upload`), accepts PNG/JPEG ≤ 2 MB (sniffed, not extension-trusted),
  writes `avatars/<username>.png`. GET stays as-is. `Cache-Control: no-cache`
  on GET so new uploads show without hard refresh (letter-fallback behavior
  unchanged when the file is absent).
- **Web**: Settings gains "Profile picture" upload (file input, client-side
  preview). A shared `AvatarImg` component tries `/api/v1/avatars/<u>` and
  falls back to today's letter-circle on error/404-default. Used in the me-bar,
  friend rows, contacts rows, chat header.
- **Android**: Coil (`io.coil-kt:coil-compose`) renders the same URL inside the
  existing `Avatar()` composable with letter fallback; Settings gains upload
  via the existing image-picker + HTTP upload plumbing.
- **Desktop**: inherits web.

### 2. Group chats (fixes B1 + Android absence)
- **Web bug fix**: incoming live `convo_msg` currently lands in write-only
  state; wire it into whatever state the group view actually renders, so live
  messages appear without reopening.
- **Android**: full convo support — `convo_info`/`convo_created`/`convo_msg`/
  `convo_history`/`convo_leave` handling in PhazeViewModel, a Groups section in
  the Recent tab, group conversations rendered through the existing chat UI
  with sender names shown. Create-group UI (name + member picks from friends).
- Group messages stay plaintext for now (matches server); the group UI shows a
  small "not end-to-end encrypted" note in the header so nobody assumes DMs'
  guarantees. Group E2EE is explicitly out of scope for this arc.

### 3. Real Recent + call history (fixes B3 + B4)
- **Server**: `calls` table (id, caller, callee, kind audio/video, started_at,
  answered INTEGER, duration_s). Insert on `call_invite`; mark answered on
  `call_answer`; finalize duration on `call_end`; a reject/timeout stays
  unanswered = missed. On finalize, send both parties a `call_log` WS event.
  New `ts` field (unix ms) on NexusMessage, set on login `friend_status` to
  the pair's last DM time so clients can sort Recent truthfully.
- **Web**: `call_log` events append a system-style line into the DM log
  ("Missed call", "Call · 4:12"); Recent previews show them.
- **Android**: same call lines; Recent tab sorts by the new `ts` and shows
  date bands (the Task-5 deferral from the Android plan now has real data).

### 4. Inline media + file UX
- **Web**: `phaze-file` bubbles with `image/*` mime render the image inline
  (max-height capped, click opens full URL); drag-and-drop onto the chat pane
  uploads like the paperclip; upload progress via XHR progress events on the
  existing `/api/v1/upload` call.
- **Android**: image `phaze-file` bubbles render inline via Coil with the same
  cap; tap opens the URL.

## Constraints (carried from prior phases)
Free assets only; no Skype/Microsoft references; hand-written style; plain-text
wire format; every task ends with its platform's build+tests green
(web: vitest + `npm run build`; server: `go test ./...`; android:
`assembleDebug testDebugUnitTest`). Server changes deploy via the Fly workflow
on push — web/server tasks land in an order where the deployed server stays
compatible with older clients (new fields optional, new endpoints additive).

## Error handling
Avatar upload rejects oversized/wrong-type with a readable message surfaced in
Settings; failed avatar GET falls back to letter-circles silently; `call_log`
for an unknown peer is dropped; group history for non-members stays
server-refused (existing check).

## Testing
Go: handler test for avatar sniff/size rejection + call-log finalize math.
Web: vitest for any new pure logic; e2e via the local-verify recipe
(two users: avatar upload → visible to peer; group live message; missed call
row). Android: JVM tests where logic is pure (recent sort with `ts`).
