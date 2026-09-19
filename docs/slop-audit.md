# How much of this project is AI slop

A direct answer to a direct question. Method: sampled every major area of
the repo for the concrete signals that distinguish slop from ordinary
software — declared things with nothing behind them, committed junk that
shouldn't be there, documentation that doesn't match the repo, and
copy/content that's generic filler rather than considered work.

**Verdict: the core engineering is real and mostly solid. The slop is
concentrated in a handful of specific, nameable pockets, not smeared evenly
across the whole thing.** Two of those pockets got a full pass in
`skype-era-gaps.md` and `website-audit.md`; this file covers the rest of
the project and pulls the picture together.

## What's genuinely solid

- **The E2EE is real.** NaCl box (Curve25519 + XSalsa20-Poly1305), confirmed
  in the actual message-handling code in `nexus_server/main.go`. Server
  stores ciphertext only.
- **2FA/TOTP, push notifications (VAPID), and Firebase for the native
  Android app are all real** — checked directly (see `website-audit.md`).
- **The Go server's concurrency discipline is genuinely careful.**
  `clients.go`'s own doc comment — "returns a COPY so callers can Send()
  without holding s.Mu" — is the kind of thing written by someone who has
  actually been burned by a lock-ordering bug.
- **Test coverage exists and catches real things.** The group-chat
  era-gating test verified to actually fail against the bug it targets
  before the fix; this project's own history shows tests catching a
  React/react-dom version mismatch that blanked the production app.
- **`nova_bot/`, and the lazy-loaded feature components in `web/src/`**
  (`Spaces`, `LivePage`, `Stories`, `RemoteControl`, `Onboarding`) all
  looked orphaned on a naive grep and turned out not to be — properly
  code-split, properly wired.
- **The site's prose voice, once the facts under it were fixed, is good** —
  "not 'we pinky promise not to,'" "we wanted Skype back." Not generic AI
  marketing tone. See `website-audit.md`.

## Where the slop actually is

### 1. A documented component that doesn't exist

The README's directory table listed:

> `native_client/` — Cross-platform desktop client (in progress)

What's actually tracked there: eight files, every one of them Gradle's own
local build-cache internals — `checksums.lock`, `fileHashes.lock`,
`gc.properties`, `last-build.bin`. No client code, no source — the
accidental leftovers of a Gradle build once run without a `.gitignore` for
it.

Two Go tools (`cmd/soundgen`, `cmd/emoticongen`) and comments in
`ws_handlers.go` referenced `native_client/assets` and "native_client
replies to key_request" as if the thing existed. It didn't.

**Meanwhile `desktop/` — a real Wails app with actual Go and frontend
code — wasn't in the README's table at all.**

### 2. Discarded work-in-progress sitting in the live, publicly-served path

`nexus_server/public/downloads/assets/` — served directly to anyone who
hits the download page — contained, alongside real assets:

```
live_capture_final_v1.png
live_capture_final_v2.png
live_capture_fixed.png
live_capture_shadow_fixed.png
live_capture_shadow_full.png
live_capture_shadow_v1.png
live_capture_tazher_fixed.png
call_button_test.png
status_online_test.png
```

The unmistakable shape of iterative image generation/editing — try,
"fixed," "final," "final v2," a person's name in a filename — with none of
the intermediate attempts cleaned up before shipping to the public folder.
12MB of a 60MB `nexus_server/` directory was this folder.

### 3. A 45MB binary living in git history forever

`nexus_server/public/downloads/Phaze.apk` is real and actually served — not
slop in the "fake" sense — but checking a 45MB signed APK directly into
git, rather than shipping it through GitHub Releases (the mechanism that
already exists in `release.yml` and has never been used), means every
future clone of this repo carries that 45MB forever, even after the file is
eventually replaced.

### 4. The retro Skype-era theme system

Fully audited in `docs/skype-era-gaps.md`. Headline: 11 of 22 declared
per-era features gated nothing at all. `group_video` and `screen_share`
were declared and shown as available in specific eras with zero
implementation behind them. Two call UIs rendered stacked on top of each
other in four eras because of a boundary widened in one place and not the
other. A duplicate CSS block silently ate every edit made to Skype 7's
palette for an unknown number of prior sessions. All fixed or tracked;
listed here as evidence for "how much," not as still-open.

### 5. The public marketing website

Fully audited and mostly fixed in `docs/website-audit.md` — the wrong
GitHub repo hardcoded in sixteen places, a fabricated "Chat Import" feature
with an invented four-step UI walkthrough, calls described as
peer-to-peer when they route through a public third party, a privacy
policy with a checkable technical claim (bcrypt cost 12) the code didn't
back up, and GitHub Pages quietly publishing this project's own internal
engineering notes to a public URL. Six of seven findings there are fixed.

### 6. The historical rate of getting it wrong the first time

Of the last 100 commits, 16 have a message pattern matching
fix/oops/actually/whoops/redo. Consistent with everything found directly
in this audit: the duplicate CSS block, the stacked call UIs, the wrong
repo link baked into six pages at once, the era-gating boundary wrong since
it was written. None of these were caught by writing the code carefully
the first time — all were caught by later, deliberate audits checking
claims against reality.

## What this adds up to

Not "the project is slop." The parts that require real engineering
judgment — the crypto, the concurrency model, the protocol design, the
test suite — are genuinely careful work. The slop is concentrated in
exactly the places you'd predict from how AI-assisted development tends to
fail: declared-but-unverified feature lists (the era gates, the website's
feature grid), generated visual assets with no cleanup pass (the
`_final_v2`/`_fixed` pile), documentation written once and never checked
against the repo again (the README's `native_client/` claim, the wrong
link baked into every page), and a pattern of shipping first and
discovering the gap later (the 16% fix-commit rate).

The throughline across every pocket: something that *reads* as complete —
a feature in a table, a link in a footer, a directory in a README — turns
out to have nothing, or the wrong thing, behind it. Most of what's been
found here is now either fixed or explicitly tracked.

## Fixed in this pass

- **`native_client/android/.gradle/` cache removed from git entirely.**
  The directory had no other tracked content, so `native_client/` is now
  gone from the tree rather than sitting there half-documented.
- **`.gitignore` broadened from `android/.gradle/` to `**/.gradle/`.** The
  narrow rule only covered the top-level `android/` tree, not the second
  one nested under `native_client/`.
- **The dead `public/downloads/assets/` folder removed** — 12MB, zero
  references anywhere in the codebase, and unreachable regardless:
  `/downloads/` is routed only through a handler that resolves the request
  via `filepath.Base()`, which can never descend into a subdirectory.
- **README's directory table corrected** — dropped the `native_client/`
  row and added `desktop/`, the real Wails app that was never listed.
- **Two Go tool comments and two `ws_handlers.go` comments** that
  referenced `native_client` as if it contained real client code, updated
  to describe what's actually there (the web client's `key_request`
  handling in `App.tsx`, also what `desktop/` embeds).

## Still open

- `Phaze.apk` (45MB) is still committed directly to the repo rather than
  shipped through GitHub Releases — same root cause as the release page:
  `release.yml` has never fired. Every future clone carries that blob in
  history regardless of whether the file is later replaced.
