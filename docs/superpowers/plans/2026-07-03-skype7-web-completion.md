# Skype 7 Web UI Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining gaps between the web app's `skype7` theme and the Skymu pixel reference: presence states, mood messages, sidebar overhaul (Contacts tab, date-grouped Recent, bottom rows), emoticons + compose bar, and Skype-7-style call screens.

**Architecture:** New features land as new components (`ContactsView.tsx`, `EmoticonPicker.tsx`, `CallScreen.tsx`, …) wired into `web/src/App.tsx`, following the existing `Spaces.tsx`/`Settings.tsx` pattern. One small Go change set in `nexus_server` for status persistence and invisible masking. Messages stay plain text on the wire; emoticons render at display time only.

**Tech Stack:** React 18 + TypeScript + Vite (web, tests via `vitest`), Go + SQLite (nexus_server), Jitsi iframe for active calls.

**Spec:** `docs/superpowers/specs/2026-07-03-skype7-web-completion-design.md`

## Global Constraints

- Free/open-source assets only; no Microsoft-owned Skype art or sounds.
- No Skype/Microsoft references in source; existing theme key `skype7` is the only exception.
- Code, commits, and UI copy must read as hand-written. No AI attribution or Co-Authored-By lines in commits.
- Wire format for messages stays plain text (`(smile)`, `:)`) so Android/desktop degrade gracefully.
- Status strings are exactly: `Online`, `Away`, `Do Not Disturb`, `Invisible` (user-settable) and `Offline` (derived). The web already colors these in `statusColor()` (App.tsx:2005).
- Skype-7 look changes are gated on `theme === 'skype7'` (JSX) / `.app.theme-skype7` (CSS) unless a task says otherwise.
- Every task ends with the app building (`cd web && npm run build`) and tests green.
- Pixel reference screenshots: `https://raw.githubusercontent.com/TheSkymuTeam/Skymu/master/Images/skymu-v0.4-chat.png` and `.../skymu-v0.4-call.png`. Re-download; never match from memory.

## Known code landmarks (verified 2026-07-03 — re-grep before editing, files shift)

- `nexus_server/ws_handlers.go` — `case "status_update"` (~line 271): sets in-memory `client.Status`, calls `s.broadcastPresence(username, msg.Body)`. No validation, no persistence, no invisible masking.
- `nexus_server/ws_handlers.go` — `case "update_profile"` (~line 305): mood (max 140) + display_name, calls `s.broadcastProfileUpdate`.
- `nexus_server/main.go:1718` — `broadcastPresence(username, status)` sends `{Type:"presence", Sender, Status, Supporter}` to online friends.
- `nexus_server/main.go:~614` — `ALTER TABLE users ADD COLUMN …` migration list (idempotent, errors ignored for existing columns).
- Hardcoded `broadcastPresence(username, "Online")` on connect/login at ws_handlers.go lines ~99, 417, 501, 776.
- `web/src/App.tsx:424` — `friends` state: `Record<string, string>` username → status string, updated by `case 'presence'` handlers (~943, 968, 1012).
- `web/src/App.tsx:610` — theme state `'light' | 'dark' | 'skype7'`.
- `web/src/App.tsx:~355` — `CallState = { peer, type: 'audio'|'video', status: 'ringing'|'active', direction }`; ring UI ~2111; Jitsi mounts at ~2099 when `status === 'active' && jitsiRoom`.
- `web/src/App.tsx:2934` — send button (`'▶'`).
- `web/src/App.tsx:~1860` — sidebar tab row (IconChat / # / IconLive), me-bar above it (~2340).
- `web/src/App.css:91` — `.app.theme-skype7` CSS variable block.

---

### Task 1: Server — status validation, persistence, invisible masking

**Files:**
- Modify: `nexus_server/main.go` (migration list ~614; `broadcastPresence` ~1718; status load on connect)
- Modify: `nexus_server/ws_handlers.go` (`case "status_update"` ~271; hardcoded `"Online"` broadcasts)
- Create: `nexus_server/presence.go`, `nexus_server/presence_test.go`

**Interfaces:**
- Consumes: existing `broadcastPresence`, `Client.Status`, users table.
- Produces: `validStatus(s string) bool` and `publicStatus(s string) string` in `presence.go`. WS contract: client sends `{type:"status_update", body:"Away"}`; friends receive `{type:"presence", sender, status}` where `Invisible` is always masked to `"Offline"`. Status survives reconnect via `users.status`.

- [x] **Step 1: Write failing tests**

```go
// nexus_server/presence_test.go
package main

import "testing"

func TestValidStatus(t *testing.T) {
	for _, s := range []string{"Online", "Away", "Do Not Disturb", "Invisible"} {
		if !validStatus(s) {
			t.Errorf("expected %q valid", s)
		}
	}
	for _, s := range []string{"", "Offline", "online", "hacker", "AWAY"} {
		if validStatus(s) {
			t.Errorf("expected %q invalid", s)
		}
	}
}

func TestPublicStatus(t *testing.T) {
	if got := publicStatus("Invisible"); got != "Offline" {
		t.Errorf("Invisible must mask to Offline, got %q", got)
	}
	if got := publicStatus("Away"); got != "Away" {
		t.Errorf("Away should pass through, got %q", got)
	}
	if got := publicStatus(""); got != "Online" {
		t.Errorf("empty status defaults to Online, got %q", got)
	}
}
```

- [x] **Step 2: Run to verify failure**

Run: `cd nexus_server && go test -run 'TestValidStatus|TestPublicStatus' ./...`
Expected: FAIL — `undefined: validStatus`

- [x] **Step 3: Implement presence.go**

```go
// nexus_server/presence.go
package main

// The four statuses a user can pick. "Offline" is never set directly —
// it's what everyone else sees when you disconnect or go Invisible.
var settableStatuses = map[string]bool{
	"Online":         true,
	"Away":           true,
	"Do Not Disturb": true,
	"Invisible":      true,
}

func validStatus(s string) bool {
	return settableStatuses[s]
}

// publicStatus is what friends are told. Invisible users look offline;
// an unset status reads as Online.
func publicStatus(s string) string {
	switch s {
	case "Invisible":
		return "Offline"
	case "":
		return "Online"
	}
	return s
}
```

- [x] **Step 4: Tests pass**

Run: `cd nexus_server && go test -run 'TestValidStatus|TestPublicStatus' ./...`
Expected: PASS

- [x] **Step 5: Wire into server**

1. Migration: append to the `ALTER TABLE users ADD COLUMN` list in main.go (~614):
   ```go
   `ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'Online'`,
   ```
2. `case "status_update"` in ws_handlers.go — replace the body with:
   ```go
   case "status_update":
   	if !validStatus(msg.Body) {
   		client.Send(NexusMessage{Type: "status_result", Error: "Unknown status"})
   		continue
   	}
   	s.DB.Exec("UPDATE users SET status = ? WHERE username = ?", msg.Body, username)
   	s.Mu.Lock()
   	if c, ok := s.Clients[username]; ok {
   		c.Status = msg.Body
   	}
   	s.Mu.Unlock()
   	client.Send(NexusMessage{Type: "status_result", Status: msg.Body})
   	s.broadcastPresence(username, msg.Body)
   ```
3. `broadcastPresence` in main.go: mask before sending — first line of the loop body becomes `Status: publicStatus(status)` (change the struct literal field).
4. Connect-time broadcasts: `grep -n 'broadcastPresence(username, "Online")' nexus_server/ws_handlers.go` — at each site, load the persisted status first and broadcast that instead:
   ```go
   st := "Online"
   s.DB.QueryRow("SELECT COALESCE(status,'Online') FROM users WHERE username = ?", username).Scan(&st)
   s.Mu.Lock()
   if c, ok := s.Clients[username]; ok { c.Status = st }
   s.Mu.Unlock()
   s.broadcastPresence(username, st)
   ```
   If the same block repeats at all four sites, extract it as `func (s *NexusServer) announcePresence(username string)` in presence.go and call that.
5. Initial friend statuses: `grep -n '"Online"\|"Offline"' nexus_server/ws_handlers.go nexus_server/main.go | grep -iv broadcast` — find where the friend list with per-friend status is sent on login (the web reads `msg.status` per friend). Wherever a friend's live status is read from `s.Clients[friend].Status`, wrap it in `publicStatus(...)`.

- [x] **Step 6: Full server tests + manual check**

Run: `cd nexus_server && go test ./...`
Expected: PASS (pre-existing suite untouched).
Manual: start the server, connect two friended users in two browser tabs, set one to `Invisible` via devtools WS send `{"type":"status_update","body":"Invisible"}` — the other tab's `friends` entry must read `Offline`.

- [x] **Step 7: Commit**

```bash
git add nexus_server/presence.go nexus_server/presence_test.go nexus_server/main.go nexus_server/ws_handlers.go
git commit -m "feat: persist user status, validate status_update, mask invisible as offline"
```

---

### Task 2: Web — presence icons, status menu, idle-away, DND mute

**Files:**
- Create: `web/src/presence.ts`, `web/src/presence.test.ts`, `web/src/PresenceIcon.tsx`
- Modify: `web/src/App.tsx` (me-bar ~2340, presence handlers ~943, sound/toast call sites), `web/src/App.css`

**Interfaces:**
- Consumes: WS contract from Task 1 (`status_update` / `status_result`); me-bar JSX; `friends` record.
- Produces: `type UserStatus = 'Online' | 'Away' | 'Do Not Disturb' | 'Invisible'`; `effectiveStatus(manual: UserStatus, idle: boolean): UserStatus`; `<PresenceIcon status={string} size={number} />` — used by Tasks 3–4 for contact rows and chat header. App state: `myStatus: UserStatus` (persisted to `localStorage['phaze_status']`), `notificationsMuted` derived from `myStatus === 'Do Not Disturb'`.

- [x] **Step 1: Failing tests for the pure logic**

```ts
// web/src/presence.test.ts
import { describe, expect, it } from 'vitest'
import { effectiveStatus } from './presence'

describe('effectiveStatus', () => {
  it('idles Online down to Away', () => {
    expect(effectiveStatus('Online', true)).toBe('Away')
  })
  it('never overrides a manual choice', () => {
    expect(effectiveStatus('Do Not Disturb', true)).toBe('Do Not Disturb')
    expect(effectiveStatus('Invisible', true)).toBe('Invisible')
    expect(effectiveStatus('Away', true)).toBe('Away')
  })
  it('reverts on activity', () => {
    expect(effectiveStatus('Online', false)).toBe('Online')
  })
})
```

Run: `cd web && npx vitest run src/presence.test.ts` — Expected: FAIL (module missing).

- [x] **Step 2: Implement presence.ts**

```ts
// web/src/presence.ts
export type UserStatus = 'Online' | 'Away' | 'Do Not Disturb' | 'Invisible'

export const STATUSES: UserStatus[] = ['Online', 'Away', 'Do Not Disturb', 'Invisible']

export const IDLE_MS = 10 * 60 * 1000

// Idle only ever downgrades Online → Away. A status the user picked by
// hand (Away, DND, Invisible) sticks until they change it.
export function effectiveStatus(manual: UserStatus, idle: boolean): UserStatus {
  return manual === 'Online' && idle ? 'Away' : manual
}
```

Run: `cd web && npx vitest run src/presence.test.ts` — Expected: PASS.

- [x] **Step 3: PresenceIcon component**

```tsx
// web/src/PresenceIcon.tsx
// Skype-7-style presence badges, drawn by hand so we ship zero third-party art.
export function PresenceIcon({ status, size = 12 }: { status: string; size?: number }) {
  const s = { width: size, height: size, display: 'inline-block', verticalAlign: 'middle' }
  if (status === 'Online')
    return (
      <svg viewBox="0 0 12 12" style={s}><circle cx="6" cy="6" r="6" fill="#7BA700" />
        <path d="M3.2 6.2l2 2 3.6-4" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" /></svg>
    )
  if (status === 'Away')
    return (
      <svg viewBox="0 0 12 12" style={s}><circle cx="6" cy="6" r="6" fill="#FCAF17" />
        <path d="M6 3v3.2l2.2 1.4" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
    )
  if (status === 'Do Not Disturb')
    return (
      <svg viewBox="0 0 12 12" style={s}><circle cx="6" cy="6" r="6" fill="#E4141B" />
        <rect x="3" y="5.1" width="6" height="1.8" rx="0.9" fill="#fff" /></svg>
    )
  return (
    <svg viewBox="0 0 12 12" style={s}><circle cx="6" cy="6" r="5.2" fill="none" stroke="#A9A9A9" strokeWidth="1.6" />
      <path d="M4.2 4.2l3.6 3.6M7.8 4.2l-3.6 3.6" stroke="#A9A9A9" strokeWidth="1.4" strokeLinecap="round" /></svg>
  )
}
```

- [x] **Step 4: Wire into App.tsx**

1. State next to `theme` (~610):
   ```tsx
   const [myStatus, setMyStatus] = useState<UserStatus>(
     () => (localStorage.getItem('phaze_status') as UserStatus) || 'Online')
   const [idle, setIdle] = useState(false)
   const shownStatus = effectiveStatus(myStatus, idle)
   const dnd = myStatus === 'Do Not Disturb'
   ```
2. Picker: me-bar avatar badge becomes `<PresenceIcon status={shownStatus} />`; clicking it opens a small dropdown listing `STATUSES`, each row `<PresenceIcon status={s} /> {s}`. On pick: `setMyStatus(s)`, `localStorage.setItem('phaze_status', s)`, send `{ type: 'status_update', body: s }` over the existing WS send helper. On `status_result` with `Error`: revert to previous value and surface via the existing `setErr` toast path. Replace the hardcoded `Online` text + `#a7d131` dot in the me-bar (~2348) with `shownStatus` + icon.
3. Idle-away: one `useEffect` — listeners on `mousemove`, `keydown`, `visibilitychange` reset a `setTimeout(IDLE_MS)`; on fire `setIdle(true)`, on activity `setIdle(false)`. A second `useEffect` on `shownStatus` sends `status_update` whenever the *effective* status changes (so Away/back-Online are announced), skipping the initial mount.
4. On login/reconnect success: send the persisted `myStatus` once so the server matches localStorage.
5. DND mute: `grep -n 'phazeSounds\|playSound\|Notification\|toast' web/src/App.tsx` — guard each notification-sound and toast call site with `if (!dnd)`. Message rendering/unread counts are NOT gated — only sounds and popups.
6. Peer icons: wherever `statusColor(...)` paints a colored dot for a friend, render `<PresenceIcon status={st} />` instead when `theme === 'skype7'` (keep dots for other themes). CSS: `.presence-menu` dropdown styled like the existing `.skype-menu-dropdown`.

- [x] **Step 5: Verify**

Run: `cd web && npx vitest run && npm run build`
Expected: all tests pass, build green.
Manual: pick DND in one tab → other tab shows red minus on that contact; incoming message in DND tab makes no sound.

- [x] **Step 6: Commit**

```bash
git add web/src/presence.ts web/src/presence.test.ts web/src/PresenceIcon.tsx web/src/App.tsx web/src/App.css
git commit -m "feat: presence states — status menu, idle-away, dnd mutes sounds"
```

---

### Task 3: Web — mood line in me-bar, peer moods

**Files:**
- Create: `web/src/MoodEditor.tsx`
- Modify: `web/src/App.tsx` (me-bar, profile message handlers), `web/src/App.css`

**Interfaces:**
- Consumes: server `update_profile` (fields `mood`, `display_name`, max 140/64; answers `update_result`; fans out via `broadcastProfileUpdate` — `grep -n "broadcastProfileUpdate" nexus_server/main.go` for the exact outbound message type, then find the matching `case` in App.tsx's WS switch; add one if the web never handled it).
- Produces: `<MoodEditor value={string} onSave={(mood: string) => void} />`; App state `myMood: string`, `moods: Record<string, string>` — Task 4's ContactsView consumes `moods`.

- [x] **Step 1: MoodEditor component**

```tsx
// web/src/MoodEditor.tsx
import { useEffect, useRef, useState } from 'react'

export function MoodEditor({ value, onSave }: { value: string; onSave: (mood: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) ref.current?.select() }, [editing])
  if (!editing)
    return (
      <button type="button" className={`mood-line${value ? '' : ' empty'}`}
        onClick={() => { setDraft(value); setEditing(true) }}>
        {value || 'Share what’s on your mind…'}
      </button>
    )
  return (
    <input ref={ref} className="mood-line-input" value={draft} maxLength={140}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { onSave(draft.trim()); setEditing(false) }
        if (e.key === 'Escape') setEditing(false)
      }}
      onBlur={() => setEditing(false)} />
  )
}
```

- [x] **Step 2: Wire into App.tsx**

1. State: `myMood` (seed from wherever the login/profile payload delivers the user's own mood — `grep -n 'mood' web/src/App.tsx web/src/Settings.tsx` first; Settings.tsx already speaks `update_profile`, reuse its field names) and `moods: Record<string, string>` filled by the profile-update case.
2. Me-bar: replace the static `Online` status line with `<MoodEditor value={myMood} onSave={saveMood} />` under the display name (the status word now lives on the presence badge from Task 2). `saveMood` sends `update_profile` with the new mood AND the current display_name (the server overwrites both — never send an empty display_name if one is set). On `update_result` error: restore previous `myMood`, toast via `setErr`.
3. Peer moods: show `moods[peer]` as a gray subtitle in the chat header under the conversation name (skype7 theme).
4. CSS (App.css, skype7 section): `.mood-line` — borderless button, left-aligned, 12px, `var(--text-secondary)`; `.mood-line.empty` — italic, `var(--muted)`; `.mood-line-input` — same footprint, 1px `var(--input-border)`.

- [x] **Step 3: Verify + commit**

Run: `cd web && npx vitest run && npm run build` — Expected: green.
Manual: set a mood in tab A → appears in tab B's chat header for that contact; survives A's reload.

```bash
git add web/src/MoodEditor.tsx web/src/App.tsx web/src/App.css
git commit -m "feat: mood line in me-bar, peer moods in chat header"
```

---

### Task 4: Web — sidebar: Contacts tab + view, date-grouped Recent, bottom rows

**Files:**
- Create: `web/src/ContactsView.tsx`
- Modify: `web/src/App.tsx` (view union, tab row ~1860/2358, convo list, sidebar bottom), `web/src/App.css`

**Interfaces:**
- Consumes: `friends: Record<string, string>`, `moods` (Task 3), `PresenceIcon` (Task 2), existing `setSelected`/DM-open handler, existing add-contact & create-group modal openers (`setAddOpen`, `setNewGroupOpen`).
- Produces: view union gains `'contacts'`; `<ContactsView friends={...} moods={...} onOpen={(u: string) => void} />`.

- [x] **Step 1: ContactsView**

```tsx
// web/src/ContactsView.tsx
import { PresenceIcon } from './PresenceIcon'

type Props = {
  friends: Record<string, string>
  moods: Record<string, string>
  onOpen: (username: string) => void
}

// Alphabetical, grouped by first letter, online contacts above offline
// within each group — same ordering classic clients used.
export function ContactsView({ friends, moods, onOpen }: Props) {
  const names = Object.keys(friends).sort((a, b) => {
    const la = a[0].toUpperCase(), lb = b[0].toUpperCase()
    if (la !== lb) return la < lb ? -1 : 1
    const oa = friends[a] !== 'Offline' ? 0 : 1
    const ob = friends[b] !== 'Offline' ? 0 : 1
    if (oa !== ob) return oa - ob
    return a.localeCompare(b)
  })
  let lastLetter = ''
  return (
    <div className="contacts-view">
      {names.length === 0 && <div className="contacts-empty">No contacts yet — add one below.</div>}
      {names.map((u) => {
        const letter = u[0].toUpperCase()
        const header = letter !== lastLetter
        lastLetter = letter
        return (
          <div key={u}>
            {header && <div className="contacts-letter">{letter}</div>}
            <button type="button" className="contacts-row" onClick={() => onOpen(u)}>
              <PresenceIcon status={friends[u]} />
              <span className="contacts-name">{u}</span>
              {moods[u] && <span className="contacts-mood">{moods[u]}</span>}
            </button>
          </div>
        )
      })}
    </div>
  )
}
```

- [x] **Step 2: Tabs + view wiring in App.tsx**

1. Extend every `view` literal union / setter: `'contacts' | 'dms' | 'spaces' | 'live'` (grep `view === '` — all sites listed in landmarks).
2. Tab row order becomes: person (Contacts) / clock (Recent = `dms`, stays the default view) / `#` (Spaces) / red dot (Live). Add two icons beside `IconChat`/`IconLive` (~App.tsx:80):
   ```tsx
   function IconPerson() {
     return (
       <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
         <circle cx="12" cy="8" r="3.6" />
         <path d="M4.5 20c1.4-3.6 4.2-5.4 7.5-5.4s6.1 1.8 7.5 5.4" strokeLinecap="round" />
       </svg>
     )
   }
   function IconClock() {
     return (
       <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
         <circle cx="12" cy="12" r="8.5" />
         <path d="M12 7.5V12l3 2" strokeLinecap="round" />
       </svg>
     )
   }
   ```
   `IconChat` on the Recent tab is replaced by `IconClock`; `IconChat` stays exported for the empty-state art if referenced elsewhere (grep before deleting).
3. Render `<ContactsView … onOpen={(u) => { setView('dms'); /* existing DM-select call */ }} />` when `view === 'contacts'` in the sidebar body (same slot the DMs list renders in).
4. Recent date groups: in the sidebar conversation list, before rendering each row compute its bucket from the convo's last-message timestamp using the same labels as the chat separators (`Today`, `Yesterday`, weekday within 7 days, else date — reuse/extract the helper at ~App.tsx:244 as `dateBucket(d: Date): string` if it isn't already callable). Emit a `.convo-date-header` div whenever the bucket changes between consecutive rows. Convos without a timestamp go last under no header.
5. Sidebar bottom (skype7 theme, below the list): 
   ```tsx
   <div className="hub-side-bottom">
     <button type="button" onClick={() => { setAddOpen(true); setAddFriend(''); setAddStatus(null) }}>Add a contact</button>
     <button type="button" onClick={() => setNewGroupOpen(true)}>Create a group</button>
     <div className="online-strip">{Object.values(friends).filter((s) => s !== 'Offline').length} people online</div>
   </div>
   ```
6. CSS: `.contacts-letter` and `.convo-date-header` — 11px uppercase `var(--muted)`, padding 6px 12px 2px; `.contacts-row` — full-width flex button, 8px gap, `var(--list-hover)` on hover; `.contacts-mood` — 11px `var(--text-secondary)`, ellipsis overflow; `.hub-side-bottom` — top border `var(--separator)`, buttons styled like Skymu's flat left-aligned rows; `.online-strip` — 11px, `var(--muted)`, `var(--shell)` background strip.

- [x] **Step 3: Verify + commit**

Run: `cd web && npx vitest run && npm run build` — Expected: green.
Manual: four tabs render and switch; Contacts groups alphabetically with presence icons; Recent shows `Today`/`Yesterday` headers; bottom buttons open the right modals; online count matches reality. Compare sidebar side-by-side with `skymu-v0.4-chat.png`.

```bash
git add web/src/ContactsView.tsx web/src/App.tsx web/src/App.css
git commit -m "feat: contacts tab, date-grouped recent list, sidebar bottom rows"
```

---

### Task 5: Emoticon tokenizer (pure module, TDD)

**Files:**
- Create: `web/src/emoticons.ts`, `web/src/emoticons.test.ts`

**Interfaces:**
- Produces: 
  ```ts
  type Token = { kind: 'text'; value: string } | { kind: 'emoticon'; id: string; shortcut: string }
  tokenize(input: string): Token[]
  EMOTICONS: { id: string; shortcuts: string[]; emoji: string; label: string }[]
  ```
  Task 6 renders tokens; Task 7 maps `id` → art. `emoji` is the unicode fallback glyph.

- [x] **Step 1: Failing tests**

```ts
// web/src/emoticons.test.ts
import { describe, expect, it } from 'vitest'
import { tokenize } from './emoticons'

const flat = (s: string) => tokenize(s).map((t) => (t.kind === 'text' ? t.value : `[${t.id}]`)).join('')

describe('tokenize', () => {
  it('converts word shortcuts', () => {
    expect(flat('hi (wave) there')).toBe('hi [wave] there')
  })
  it('converts symbol shortcuts', () => {
    expect(flat('ok :) bye :-(')).toBe('ok [smile] bye [sad]')
  })
  it('leaves unknown parens alone', () => {
    expect(flat('call me (maybe)')).toBe('call me (maybe)')
  })
  it('never touches URLs', () => {
    expect(flat('see https://a.io/x:(y) ok')).toBe('see https://a.io/x:(y) ok')
  })
  it('handles emoticon-only messages', () => {
    expect(tokenize('(heart)')).toEqual([{ kind: 'emoticon', id: 'heart', shortcut: '(heart)' }])
  })
  it('prefers the longest match', () => {
    expect(flat(':-)')).toBe('[smile]') // not ":-" + ")"
  })
})
```

Run: `cd web && npx vitest run src/emoticons.test.ts` — Expected: FAIL (module missing).

- [x] **Step 2: Implement**

```ts
// web/src/emoticons.ts
export type Token =
  | { kind: 'text'; value: string }
  | { kind: 'emoticon'; id: string; shortcut: string }

// The classic twenty plus a few extras. Order inside `shortcuts` doesn't
// matter — matching always takes the longest hit at each position.
export const EMOTICONS = [
  { id: 'smile', shortcuts: ['(smile)', ':-)', ':)'], emoji: '🙂', label: 'Smile' },
  { id: 'laugh', shortcuts: ['(laugh)', ':-D', ':D'], emoji: '😄', label: 'Laugh' },
  { id: 'wink', shortcuts: ['(wink)', ';-)', ';)'], emoji: '😉', label: 'Wink' },
  { id: 'sad', shortcuts: ['(sad)', ':-(', ':('], emoji: '🙁', label: 'Sad' },
  { id: 'cry', shortcuts: ['(cry)', ";'("], emoji: '😢', label: 'Crying' },
  { id: 'wave', shortcuts: ['(wave)', '(bye)'], emoji: '👋', label: 'Wave' },
  { id: 'heart', shortcuts: ['(heart)', '<3'], emoji: '❤️', label: 'Heart' },
  { id: 'kiss', shortcuts: ['(kiss)', ':-*', ':*'], emoji: '😘', label: 'Kiss' },
  { id: 'cool', shortcuts: ['(cool)', '8-)'], emoji: '😎', label: 'Cool' },
  { id: 'angry', shortcuts: ['(angry)', ':@'], emoji: '😠', label: 'Angry' },
  { id: 'surprised', shortcuts: ['(surprised)', ':-O', ':O'], emoji: '😮', label: 'Surprised' },
  { id: 'blush', shortcuts: ['(blush)', ':$'], emoji: '😊', label: 'Blushing' },
  { id: 'tongue', shortcuts: ['(tongue)', ':-P', ':P'], emoji: '😛', label: 'Tongue out' },
  { id: 'sweat', shortcuts: ['(sweat)', '(whew)'], emoji: '😅', label: 'Sweating' },
  { id: 'party', shortcuts: ['(party)'], emoji: '🥳', label: 'Party' },
  { id: 'sleepy', shortcuts: ['(sleepy)', '|-)'], emoji: '😪', label: 'Sleepy' },
  { id: 'think', shortcuts: ['(think)', ':-?'], emoji: '🤔', label: 'Thinking' },
  { id: 'yes', shortcuts: ['(yes)', '(y)'], emoji: '👍', label: 'Thumbs up' },
  { id: 'no', shortcuts: ['(no)', '(n)'], emoji: '👎', label: 'Thumbs down' },
  { id: 'hug', shortcuts: ['(hug)'], emoji: '🤗', label: 'Hug' },
] as const

const byShortcut = new Map<string, string>()
for (const e of EMOTICONS) for (const s of e.shortcuts) byShortcut.set(s, e.id)
// Longest first so ":-)" wins over ":)" when both could start at a position.
const allShortcuts = [...byShortcut.keys()].sort((a, b) => b.length - a.length)
const urlRe = /https?:\/\/\S+/y

export function tokenize(input: string): Token[] {
  const out: Token[] = []
  let text = ''
  let i = 0
  const flush = () => { if (text) { out.push({ kind: 'text', value: text }); text = '' } }
  outer: while (i < input.length) {
    urlRe.lastIndex = i
    const url = urlRe.exec(input)
    if (url) { text += url[0]; i += url[0].length; continue }
    for (const s of allShortcuts) {
      if (input.startsWith(s, i)) {
        flush()
        out.push({ kind: 'emoticon', id: byShortcut.get(s)!, shortcut: s })
        i += s.length
        continue outer
      }
    }
    text += input[i]
    i += 1
  }
  flush()
  return out
}
```

- [x] **Step 3: Tests pass, commit**

Run: `cd web && npx vitest run src/emoticons.test.ts` — Expected: PASS (all 6).

```bash
git add web/src/emoticons.ts web/src/emoticons.test.ts
git commit -m "feat: emoticon shortcut tokenizer with classic skype-style codes"
```

---

### Task 6: Compose bar — picker, Send message pill, emoticon rendering

**Files:**
- Create: `web/src/EmoticonPicker.tsx`
- Modify: `web/src/App.tsx` (compose bar ~2934, message body rendering), `web/src/App.css`

**Interfaces:**
- Consumes: `EMOTICONS`, `tokenize` (Task 5).
- Produces: `<EmoticonPicker onPick={(shortcut: string) => void} onClose={() => void} />`; `<MessageBody text={string} />` helper inside App.tsx used everywhere a message body currently renders as text.

- [ ] **Step 1: EmoticonPicker**

```tsx
// web/src/EmoticonPicker.tsx
import { useEffect, useRef } from 'react'
import { EMOTICONS } from './emoticons'
import { Emoticon } from './emoticonArt'

export function EmoticonPicker({ onPick, onClose }: { onPick: (shortcut: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [onClose])
  return (
    <div className="emoticon-picker" ref={ref}>
      {EMOTICONS.map((e) => (
        <button key={e.id} type="button" title={`${e.label} ${e.shortcuts[0]}`}
          onClick={() => onPick(e.shortcuts[0])}>
          <Emoticon id={e.id} />
        </button>
      ))}
    </div>
  )
}
```

Until Task 7 lands, create a stub `web/src/emoticonArt.tsx` so this compiles — the stub IS the unicode fallback layer and stays as the final fallback:

```tsx
// web/src/emoticonArt.tsx
import { EMOTICONS } from './emoticons'

const glyphs = new Map(EMOTICONS.map((e) => [e.id, e.emoji]))

export function Emoticon({ id }: { id: string }) {
  return <span className="emoticon" role="img">{glyphs.get(id) ?? id}</span>
}
```

- [ ] **Step 2: Wire the compose bar and message rendering in App.tsx**

1. `MessageBody` helper near the other small components:
   ```tsx
   function MessageBody({ text }: { text: string }) {
     return (
       <>
         {tokenize(text).map((t, i) =>
           t.kind === 'text' ? <span key={i}>{t.value}</span> : <Emoticon key={i} id={t.id} />)}
       </>
     )
   }
   ```
   Find every place a chat message body renders (`grep -n '\.body' web/src/App.tsx` in the message-list JSX; mind existing linkify logic — run `tokenize` on the plain-text segments only, links keep their current rendering) and swap raw text for `<MessageBody text={...} />`.
2. Compose bar: smiley toggle button left of the input (reuse the `smile` SVG path from `PresenceIcon`-style hand-drawn art or a simple circle-face SVG), state `pickerOpen`; `onPick` inserts the shortcut at the cursor (`input.selectionStart`) plus a trailing space and refocuses.
3. Send button (~2934): when `theme === 'skype7'` render `Send message` in a blue pill (class `send-pill`); other themes keep `'▶'`.
4. CSS: `.emoticon-picker` — absolute popover above the compose bar, white, `var(--panel-edge)` border, `var(--shadow-md)`, 8-per-row grid, 4px gap; buttons 30×30 flat, `var(--list-hover)` on hover; `.emoticon` — inline-block, `font-size: 18px`, 1px 2px margin; `.send-pill` — `var(--brand)` background, white 13px text, 999px radius, 6px 16px padding, `var(--brand-hover)` on hover.

- [ ] **Step 3: Verify + commit**

Run: `cd web && npx vitest run && npm run build` — Expected: green.
Manual: pick `(wave)` from the picker → shortcut lands in input → send → renders as the emoticon in both sender and recipient tabs; a message that is only `https://example.com/:( ` keeps its link intact.

```bash
git add web/src/EmoticonPicker.tsx web/src/emoticonArt.tsx web/src/App.tsx web/src/App.css
git commit -m "feat: emoticon picker, send message pill, emoticons render in chat"
```

---

### Task 7: Hand-drawn animated emoticon art

**Files:**
- Modify: `web/src/emoticonArt.tsx` (replace stub internals, keep the `Emoticon` interface), `web/src/App.css`
- Modify: `web/src/Settings.tsx` (About section credit line)

**Interfaces:**
- Consumes/Produces: `<Emoticon id={string} />` signature unchanged — no caller edits.

- [ ] **Step 1: Draw the classics as animated inline SVGs**

Replace the glyph map with hand-drawn SVG components for all 20 ids in `EMOTICONS`. House style — 20×20 viewBox, `#FFD764` face circle with `#B98A00` 1px stroke, dark `#5B4300` features, one CSS animation class each. Example for two; draw the rest in the same voice:

```tsx
function ArtSmile() {
  return (
    <svg viewBox="0 0 20 20" className="emo">
      <circle cx="10" cy="10" r="9" fill="#FFD764" stroke="#B98A00" strokeWidth="1" />
      <circle cx="6.8" cy="8" r="1.2" fill="#5B4300" />
      <circle cx="13.2" cy="8" r="1.2" fill="#5B4300" />
      <path d="M6 12.2c1.2 1.8 2.6 2.6 4 2.6s2.8-.8 4-2.6" stroke="#5B4300" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  )
}
function ArtWave() {
  return (
    <svg viewBox="0 0 20 20" className="emo emo-wave">
      <circle cx="9" cy="10" r="8" fill="#FFD764" stroke="#B98A00" strokeWidth="1" />
      <circle cx="6.4" cy="8.4" r="1.1" fill="#5B4300" />
      <circle cx="11.6" cy="8.4" r="1.1" fill="#5B4300" />
      <path d="M6 12.6c1 1.4 2.2 2 3 2s2-.6 3-2" stroke="#5B4300" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <g className="emo-hand">
        <path d="M15.5 6.5c.8-.4 1.8-.2 2.2.6.4.8.1 1.7-.7 2.2l-1.8 1-1.4-2.6z" fill="#FFD764" stroke="#B98A00" strokeWidth="0.8" />
      </g>
    </svg>
  )
}
```

Component picks art by id, falls back to the unicode glyph for anything unmapped:

```tsx
const art: Record<string, () => JSX.Element> = {
  smile: ArtSmile, wave: ArtWave, /* …the other 18… */
}

export function Emoticon({ id }: { id: string }) {
  const A = art[id]
  if (A) return <span className="emoticon"><A /></span>
  return <span className="emoticon" role="img">{glyphs.get(id) ?? id}</span>
}
```

- [ ] **Step 2: Animations in App.css**

```css
.emoticon .emo { width: 20px; height: 20px; vertical-align: -4px; }
.emo-wave .emo-hand { transform-origin: 15px 10px; animation: emo-wave-hand 1.1s ease-in-out infinite; }
@keyframes emo-wave-hand {
  0%, 100% { transform: rotate(0deg); }
  30% { transform: rotate(-24deg); }
  60% { transform: rotate(10deg); }
}
```

Give each animated id one small keyframe in the same spirit (heart pulses `scale(1)→(1.15)`, cry has a falling tear `translateY`, party confetti wiggles, laugh bounces 1px, think's brow shifts). Honor reduced motion:

```css
@media (prefers-reduced-motion: reduce) { .emoticon * { animation: none !important; } }
```

- [ ] **Step 3: Credit line in Settings → About**

`grep -n -i 'about\|version' web/src/Settings.tsx` — in the About block add: `Emoticon art drawn in-house. Fallback emoji rendered by your system font.` (No third-party art shipped means no license text needed; if any Twemoji SVG does get bundled later, this line must instead carry `Twemoji — CC-BY 4.0`.)

- [ ] **Step 4: Verify + commit**

Run: `cd web && npx vitest run && npm run build` — Expected: green.
Manual: all 20 picker cells show drawn faces (no unicode glyphs); wave waves, heart pulses; OS reduced-motion setting freezes them.

```bash
git add web/src/emoticonArt.tsx web/src/App.css web/src/Settings.tsx
git commit -m "art: hand-drawn animated emoticon set, reduced-motion safe"
```

---

### Task 8: Skype 7 call screens

**Files:**
- Create: `web/src/CallScreen.tsx`, `web/src/call.css`
- Modify: `web/src/App.tsx` (call overlay ~2099–2130), `web/src/main.tsx` or App.tsx (css import, match how `live.css` is imported)

**Interfaces:**
- Consumes: `CallState` (~App.tsx:355), `jitsiRoom` state, existing handlers (grep names before wiring): `startCall`, the answer handler, the reject/hang-up path that sends `call_reject`/`call_end` (~861), `avatarColor(name)`.
- Produces:
  ```tsx
  <CallScreen state={CallState} jitsiUrl={string | null}
    onAnswer={() => void} onHangUp={() => void} />
  ```

- [ ] **Step 1: CallScreen component**

```tsx
// web/src/CallScreen.tsx
import './call.css'

type CallState = {
  peer: string
  type: 'audio' | 'video'
  status: 'ringing' | 'active'
  direction: 'outgoing' | 'incoming'
}

function avatarColorLocal(name: string) {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360
  return `hsl(${h}, 55%, 45%)`
}

export function CallScreen({ state, jitsiUrl, onAnswer, onHangUp }: {
  state: CallState
  jitsiUrl: string | null
  onAnswer: () => void
  onHangUp: () => void
}) {
  const ringing = state.status === 'ringing'
  return (
    <div className="call7">
      <span className="call7-mark">phaze</span>
      {ringing || !jitsiUrl ? (
        <div className="call7-center">
          <span className="call7-avatar" style={{ background: avatarColorLocal(state.peer) }}>
            {state.peer[0]?.toUpperCase()}
          </span>
          <div className="call7-name">{state.peer}</div>
          <div className="call7-state">
            {ringing && state.direction === 'outgoing' && <>calling<span className="call7-dots"><i>.</i><i>.</i><i>.</i></span></>}
            {ringing && state.direction === 'incoming' && `incoming ${state.type} call`}
            {!ringing && 'connecting…'}
          </div>
        </div>
      ) : (
        <iframe className="call7-jitsi" src={jitsiUrl} allow="camera; microphone; fullscreen; display-capture" title="call" />
      )}
      <div className="call7-bar">
        {ringing && state.direction === 'incoming' && (
          <button type="button" className="call7-answer" onClick={onAnswer} title="Answer">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1l-2.2 2.2z"/></svg>
          </button>
        )}
        <button type="button" className="call7-hangup" onClick={onHangUp} title={ringing && state.direction === 'incoming' ? 'Decline' : 'Hang up'}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M12 9c-2.9 0-5.6.6-8 1.7-.6.3-1 .9-1 1.6v2.3c0 .6.4 1 1 1h3c.6 0 1-.4 1-1v-1.6c1.3-.4 2.6-.6 4-.6s2.7.2 4 .6V14c0 .6.4 1 1 1h3c.6 0 1-.4 1-1v-2.3c0-.7-.4-1.3-1-1.6C17.6 9.6 14.9 9 12 9z"/></svg>
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: call.css**

```css
/* Classic call screen — deep teal wash, centered caller card, dark bar. */
.call7 {
  position: fixed; inset: 0; z-index: 60;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: radial-gradient(120% 120% at 50% 0%, #1D5F7A 0%, #123F53 55%, #0C2C3B 100%);
  color: #fff;
}
.call7-mark {
  position: absolute; top: 18px; right: 26px;
  font-size: 26px; font-weight: 600; letter-spacing: -0.5px; opacity: 0.14;
}
.call7-center { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.call7-avatar {
  width: 96px; height: 96px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-size: 40px; font-weight: 600; color: #fff;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
}
.call7-name { font-size: 22px; font-weight: 600; }
.call7-state { font-size: 14px; opacity: 0.85; }
.call7-dots i { font-style: normal; animation: call7-blink 1.4s infinite; }
.call7-dots i:nth-child(2) { animation-delay: 0.2s; }
.call7-dots i:nth-child(3) { animation-delay: 0.4s; }
@keyframes call7-blink { 0%, 60%, 100% { opacity: 0.2; } 30% { opacity: 1; } }
.call7-jitsi { position: absolute; inset: 0 0 76px 0; width: 100%; height: calc(100% - 76px); border: 0; }
.call7-bar {
  position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 14px; padding: 10px 22px;
  background: rgba(10, 24, 32, 0.82); border-radius: 999px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
}
.call7-bar button {
  width: 48px; height: 48px; border-radius: 50%; border: 0; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.call7-answer { background: #5CB85C; }
.call7-answer:hover { background: #4CAE4C; }
.call7-hangup { background: #E4141B; }
.call7-hangup:hover { background: #C51017; }
```

- [ ] **Step 3: Wire into App.tsx**

In the call overlay block (~2099): when `theme === 'skype7' && callState`, render `<CallScreen state={callState} jitsiUrl={callState.status === 'active' && jitsiRoom ? /* the exact URL currently given to the Jitsi mount — grep jitsiRoom usage */ : null} onAnswer={/* existing answer handler */} onHangUp={/* existing reject/end handler that sends call_reject or call_end (~861) */} />` and skip the old overlay; other themes keep the current UI. Ringtone behavior (`ringingAudioRef`) is untouched — it lives outside the overlay JSX.

- [ ] **Step 4: Verify + commit**

Run: `cd web && npx vitest run && npm run build` — Expected: green.
Manual, two tabs: outgoing shows teal screen + "calling…" dots; incoming shows green/red buttons; answer drops both into Jitsi inside the chrome; red button ends the call for both sides (server gets `call_end`, not just an iframe unmount). Compare against `skymu-v0.4-call.png`.

```bash
git add web/src/CallScreen.tsx web/src/call.css web/src/App.tsx
git commit -m "feat: classic call screens — teal ring screen, dark control bar, jitsi inside"
```

---

### Task 9: Pixel pass against Skymu

**Files:**
- Modify: `web/src/App.css` (skype7 section only) — whatever the comparison flags.

- [ ] **Step 1: Fetch references**

```bash
mkdir -p scratch/skymu
curl -sL -o scratch/skymu/chat.png https://raw.githubusercontent.com/TheSkymuTeam/Skymu/master/Images/skymu-v0.4-chat.png
curl -sL -o scratch/skymu/call.png https://raw.githubusercontent.com/TheSkymuTeam/Skymu/master/Images/skymu-v0.4-call.png
```

- [ ] **Step 2: Side-by-side at 100% zoom**

Run `cd web && npm run dev`, open the app in skype7 theme next to each screenshot. Check, in order: menu bar height/background; me-bar spacing; tab row underline style; date-header typography; contact row density; compose bar proportions and Send pill; call screen gradient stops and bar placement. Fix only real mismatches — do not invent detail the screenshots don't show.

- [ ] **Step 3: Full suite + commit**

Run: `cd web && npx vitest run && npm run build && cd ../nexus_server && go test ./...`
Expected: everything green.

```bash
git add web/src/App.css
git commit -m "style: pixel pass on skype7 chrome against skymu reference"
```
