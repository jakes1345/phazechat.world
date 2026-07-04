# Platform Arc 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avatars everywhere, group chats on Android (+ web live-message fix), real Recent with call history, inline image media — per `docs/superpowers/specs/2026-07-03-platform-arc2-design.md`.

**Architecture:** Additive server changes (one new POST route, one new table, one new optional `ts` field) so deployed server stays compatible with old clients. Client work follows each platform's established patterns (React components in `web/src`, StateFlow + composables on Android).

**Tech Stack:** Go/SQLite server, React+TS web (vitest), Kotlin/Compose Android (+ new dep `io.coil-kt:coil-compose:2.7.0`).

## Global Constraints
- Statuses/emoticons/wire format rules unchanged from prior phases; no AI attribution in commits; hand-written style.
- Gate per task: server `go test ./...`; web `npx vitest run && npm run build`; android `./gradlew assembleDebug testDebugUnitTest`.
- Server compat: new message fields must be optional; never repurpose existing fields.

## Landmarks (verified 2026-07-03 — re-grep, lines shift)
- `nexus_server/main.go`: avatarHandler ~:4223 (GET, serves `avatars/<u>.png`, default fallback); migrations list ~:614; `/api/v1/upload` handler exists (grep `"/api/v1/upload"`); session auth for HTTP — grep how upload authenticates (cookie/session middleware) and reuse.
- `nexus_server/ws_handlers.go`: `case "call_invite"` / `call_answer` / `call_reject` / `call_end` (grep); login friend_status loops at ~:106/:441/:515 (post-presence work).
- Web `App.tsx`: `convos` state :691; `case 'convo_msg'` :1170 writes to write-only `setConvoLogs` (B1); group view renders from — **grep `selectedConvo` render block to find the real message source**; `appendLog(sender, text, me)` exists for DM log lines; `avatarColor(u)` letter-circles at `.avatar` spans; Settings.tsx profile section ~:480.
- Android: `Avatar()` in ChatsScreen.kt:248; upload plumbing — grep `uploadFile\|/api/v1/upload` in PhazeViewModel (used by attach); `NexusMessage.kt` field mapping (add `convoId`, `convoName`, `members`, `ts` if absent — grep first); ChatScreen reused for DMs; MainActivity `pageContent` when(page).
- Server pushes `convo_info` per membership at login; `convo_history` returns last 100 with `sent_at`; membership checked server-side.

---

### Task 1: Server — avatar upload endpoint
- [x] Create `nexus_server/avatars.go`: `func (s *NexusServer) avatarUploadHandler(w, r)` — POST only; authenticate exactly like `/api/v1/upload` (grep and copy its session check); `r.Body` capped via `http.MaxBytesReader(w, r.Body, 2<<20)`; read, sniff with `http.DetectContentType` allowing `image/png`/`image/jpeg`; decode via `image/png`+`image/jpeg`, re-encode PNG, write `avatars/<username>.png` (MkdirAll first). JSON `{ok:true}` / error text.
- [x] Register in main.go next to the GET route: `http.HandleFunc("/api/v1/avatars", rateLimit(server.avatarUploadHandler))` (no trailing slash = upload; with slash = GET stays).
- [x] GET handler: add `w.Header().Set("Cache-Control", "no-cache")`.
- [x] Test `nexus_server/avatars_test.go`: table test on the sniff/size validation helper (extract `validateAvatar(data []byte) error`).
- [x] Gate + commit `feat: avatar upload endpoint, png/jpeg sniffed, 2mb cap`.

### Task 2: Web — AvatarImg everywhere + Settings upload
- [x] Create `web/src/AvatarImg.tsx`: props `{user, size, className?}`; renders `<span class="avatar">` letter-circle exactly as today PLUS an absolutely-positioned `<img src={/api/v1/profile-independent avatar URL}?v=bump>` that hides itself `onError`; export a module-level `bumpAvatarVersion(user)` (Map + listeners or simple counter state via zustand-free custom event) so an upload refreshes instances.
- [x] Swap the letter-circle at: me-bar, friend rows, contacts rows, chat header, palette rows (grep `avatarColor(` render sites in App.tsx/ContactsView.tsx — keep presence badges overlaid as-is).
- [x] Settings.tsx: "Profile picture" block — file input; POST body to `/api/v1/avatars` with `credentials:'include'`; on ok call `bumpAvatarVersion(me)`; error → existing settings error surface.
- [x] Gate + commit `feat: profile pictures on web — upload in settings, avatars with letter fallback`.

### Task 3: Android — Coil avatars + upload
- [x] `app/build.gradle.kts`: `implementation("io.coil-kt:coil-compose:2.7.0")`.
- [x] `Avatar()` (ChatsScreen.kt:248): wrap letter Box with Coil `AsyncImage(model = "$httpBase/api/v1/avatars/$name", ...)` on top; find `httpBase`/server URL source (grep how PhazeViewModel builds HTTP URLs for upload) — pass or hardcode same constant path used by uploads; keep letter beneath (AsyncImage transparent until success).
- [x] SettingsScreen: "Profile picture" row → image picker (reuse the pattern of story/file pickers in MainActivity — add a callback param wired there) → VM `uploadAvatar(uri)` using the same OkHttp/HttpURLConnection code path as file upload but to `/api/v1/avatars`.
- [x] Gate + commit `feat: profile pictures on android — coil rendering, upload in settings`.

### Task 4: Web — fix B1 (live group messages invisible)
- [x] Grep the `selectedConvo` render block; identify the state the group message list ACTUALLY reads (likely populated only by `convo_history`). Point `case 'convo_msg'` at that same state (and delete the write-only `convoLogs` if truly redundant — verify with grep before deleting).
- [x] Add a "not end-to-end encrypted" caption in the group chat header (skype7 + default themes).
- [x] Manual verify via local-verify recipe (two users, one group, live message appears). Gate + commit `fix: live group messages render without reopening the convo`.

### Task 5: Android — group chats
- NexusMessage.kt: ensure `convo_id`, `convo_name`, `members` map (grep; add missing).
- PhazeViewModel: `_convos: MutableStateFlow<List<ConvoInfo>>` (`data class ConvoInfo(id, name, members)`), `_selectedConvo`, `_convoLog: MutableStateFlow<List<ChatLine>>`; cases `convo_info`/`convo_created` (add + request history), `convo_msg` (append when selected; unread++ otherwise), `convo_history` reply handling (grep the exact reply type the server sends — read server case), `createConvo(name, members)`, `sendConvoMessage(text)` (plaintext body), `selectConvo(id)`.
- UI: Groups section under Recent tab list (ChatsScreen param or separate composable `GroupsSection(convos, onOpen)`); group chat screen = reuse `ChatScreen` with `peerStatus = "${members.size} people"` and sender names already shown for non-me lines; "＋ group" entry (name + friend checkboxes — mirror web's modal).
- Header note "not end-to-end encrypted".
- Gate + commit `feat: group chats on android — list, create, live messages, history`.

### Task 6: Server — call log + `ts` on friend_status
- Migration: ```CREATE TABLE IF NOT EXISTS calls (id INTEGER PRIMARY KEY AUTOINCREMENT, caller TEXT, callee TEXT, kind TEXT, started_at DATETIME DEFAULT CURRENT_TIMESTAMP, answered INTEGER DEFAULT 0, duration_s INTEGER DEFAULT 0)```.
- `call_invite`: INSERT row, stash id in the Client (or map keyed by pair). `call_answer`: answered=1 + note answer time (in-memory). `call_end`/`call_reject`: finalize duration (0 for missed), then send both parties `{type:"call_log", sender:caller, recipient:callee, body:kind, status: answered?"answered":"missed", ts: startedUnixMs, duration…}` — add optional `Ts int64 \`json:"ts,omitempty"\`` and `Duration int \`json:"duration,omitempty"\`` to NexusMessage.
- Login friend_status loop: include `Ts` = `SELECT MAX(strftime('%s', sent_at))*1000 FROM dm_messages WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)`.
- Unit test: finalize math helper (missed vs answered duration). Gate + commit `feat: call log table, call_log events, last-message ts on friend_status`.

### Task 7: Web — call rows + Recent truth
- `case 'call_log'`: `appendLog(peer, body, false, …)` as a system-style line — grep how system lines render (`'system'` sender in appendLog) and add a `call-line` style: "📞 Missed call" red / "📞 Call · m:ss".
- friend_status `ts` → seed `lastLineFor` ordering when local history is empty (store in a `lastTsRef` map consulted by the Recent sort).
- Gate + commit `feat: call history lines in chat, recent order seeded from server ts`.

### Task 8: Android — call rows + real Recent
- `call_log` case → append ChatLine (system style) to the peer's log + bump unread if not open.
- FriendInfo gains `lastTs: Long = 0` set from friend_status `ts`; ChatsScreen sorts by `lastTs` desc (falls back to old order when all zero) and shows the date bands (dayLabel helper from the android plan Task 5 — implement now that data exists).
- JVM test: recent sort comparator. Gate + commit `feat: android recent sorted by real time, call rows, date bands`.

### Task 9: Web — inline images + drag-drop + progress
- In the `phaze-file` bubble branch: `mime.startsWith('image/')` → `<img class="bubble-img" src={url} loading="lazy" onClick=open>` (max-height 260px CSS, radius) instead of the paperclip row.
- Drag-drop: `onDragOver`/`onDrop` on the chat pane → same handler as paperclip file pick.
- Progress: swap the upload `fetch` for XHR with `upload.onprogress` → thin progress bar above compose (state `uploadPct`).
- Gate + commit `feat: inline image bubbles, drag-drop upload with progress`.

### Task 10: Android — inline images
- Same mime branch in MessageBubble → Coil `AsyncImage` capped 220.dp, click opens URL (uriHandler exists).
- Gate + commit `feat: inline image bubbles on android`.

### Task 11: Arc gate
- All three platform suites green; run local-verify e2e for: avatar upload visible cross-user, group live message, missed-call row. Push. Fly deploys server+web automatically; note Android needs manual install.
