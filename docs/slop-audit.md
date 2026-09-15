# How much of this project is AI slop

A direct answer to a direct question, checked rather than guessed at. Method:
sampled every major area of the repo — not just the two things already
audited this session (the retro Skype themes, the marketing website) — for
the concrete signals that actually distinguish slop from ordinary software:
declared things with nothing behind them, committed junk that shouldn't be
there, documentation that doesn't match the repo, and copy/content that's
generic filler rather than considered work.

**The verdict: the core engineering is real and mostly solid. The slop is
concentrated in a handful of specific, nameable pockets — not smeared evenly
across the whole thing.** Two of those pockets got a full pass already this
session (`skype-era-gaps.md`, `website-audit.md`); this file covers the rest
of the project and pulls the picture together.

## What's genuinely solid — checked, not assumed

- **The E2EE is real.** NaCl box (Curve25519 + XSalsa20-Poly1305), confirmed
  by reading the actual message-handling code in `nexus_server/main.go`, not
  by trusting a comment. Server stores ciphertext only.
- **2FA/TOTP, push notifications (VAPID), and Firebase for the native
  Android app are all real** — checked directly in `website-audit.md` after
  suspecting at least one might be a mismatch.
- **The Go server's concurrency discipline is genuinely careful.**
  `clients.go`'s own doc comment — "returns a COPY so callers can Send()
  without holding s.Mu" — is the kind of thing that only gets written by
  someone who has actually been burned by a lock-ordering bug, not
  generated to sound thorough.
- **Test coverage exists and catches real things.** Not decorative — the
  group-chat era-gating test added this session was verified to actually
  fail against the bug it targets before the fix, and this project's own
  history shows tests catching a React/react-dom version mismatch that
  blanked the production app.
- **`nova_bot/`, and the lazy-loaded feature components in `web/src/`**
  (`Spaces`, `LivePage`, `Stories`, `RemoteControl`, `Onboarding`) all
  looked orphaned on a naive grep and turned out not to be — properly
  code-split, properly wired. Worth stating since the naive check would
  have reported five false positives.
- **The site's actual prose voice, once the facts under it were fixed, is
  good** — "not 'we pinky promise not to,'" "we wanted Skype back." Not
  generic AI marketing tone. See `website-audit.md`.

## Where the slop actually is

### 1. A documented component that doesn't exist

The README's own directory table lists:

> `native_client/` — Cross-platform desktop client (in progress)

Checked what's actually tracked there: **eight files, every one of them
Gradle's own local build-cache internals** —
`checksums.lock`, `fileHashes.lock`, `gc.properties`, `last-build.bin`. No
client code. No source. Nothing "in progress" — just the accidental
leftovers of someone running a Gradle build once and `git add`ing the
working directory without a `.gitignore` for it.

Two Go tools (`cmd/soundgen`, `cmd/emoticongen`) and comments in
`ws_handlers.go` reference `native_client/assets` and "native_client
replies to key_request" as if the thing exists and does something. It
doesn't, currently.

Worth noting what makes this different from the website's fabricated
Chat Import feature: that was invented marketing copy with zero grounding.
This might be a real plan that just never got past "one Gradle build ran
once" — the README language ("in progress") is honest about that if you
take it at face value. But the tracked `.gradle/` cache files are pure
accident either way, and should never have been committed.

**Meanwhile `desktop/` — a real Wails app with actual Go and frontend
code — isn't in the README's table at all.** The map doesn't match the
territory in either direction: overclaims one directory, doesn't mention
another that's real.

### 2. Discarded work-in-progress sitting in the live, publicly-served path

`nexus_server/public/downloads/assets/` — served directly to anyone who
hits the download page — contains, alongside real assets:

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

This is the unmistakable shape of iterative image generation or editing —
try, "fixed," "final," "final v2," a person's name in a filename — where
none of the intermediate attempts were ever cleaned up before being
shipped to the public folder. 12MB of a 60MB `nexus_server/` directory is
this folder; a meaningful fraction of that is discarded drafts, not
assets anything actually references.

### 3. A 45MB binary living in git history forever

`nexus_server/public/downloads/Phaze.apk` is real and actually served —
not slop in the "fake" sense — but checking a 45MB signed APK directly
into git, rather than shipping it through GitHub Releases (the mechanism
that already exists in `release.yml` and has simply never been used, per
`website-audit.md`), means every future clone of this repo carries that
45MB forever, even after the file is eventually replaced. This is a repo
hygiene problem the exact same release pipeline already scoped as missing
would fix as a side effect.

### 4. The retro Skype-era theme system

Already fully audited in `docs/skype-era-gaps.md`, not repeating the
detail here — just the headline, since it belongs on this ledger: **11 of
22 declared per-era features gated nothing at all.** `group_video` and
`screen_share` were declared and shown as available in specific eras with
zero implementation behind them. Two call UIs rendered stacked on top of
each other in four eras because of a boundary that got widened in one
place and not the other. A duplicate CSS block silently ate every edit
made to Skype 7's palette for an unknown number of prior sessions. All of
this is now fixed or explicitly tracked; it's listed here because it's
real evidence for "how much," not because it's still open.

### 5. The public marketing website

Already fully audited and mostly fixed in `docs/website-audit.md` — the
wrong GitHub repo hardcoded in sixteen places, a fabricated "Chat Import"
feature with an invented four-step UI walkthrough, calls described as
peer-to-peer when they route through a public third party, a privacy
policy with a checkable technical claim (bcrypt cost 12) the code didn't
back up, and GitHub Pages quietly publishing this project's own internal
engineering notes to a public URL. Also listed here for the ledger, not
because it's still open — six of seven findings there are fixed.

### 6. The historical rate of getting it wrong the first time

Of the last 100 commits, **16 have a message pattern matching
fix/oops/actually/whoops/redo** — a real, non-trivial rate of "this
needed a second pass," not a vague impression. That's consistent with
everything found directly this session: the duplicate CSS block, the
stacked call UIs, the wrong repo link baked into six pages at once, the
era-gating boundary that had been wrong since it was written. None of
these were caught by writing the code carefully the first time — all of
them were caught by later, deliberate audits going back and checking
claims against reality.

## What this adds up to

Not "the project is slop." The parts that require real engineering
judgment — the crypto, the concurrency model, the protocol design, the
test suite — are genuinely careful work. The slop is specifically
concentrated in exactly the places you'd predict if you know how AI-assisted
development tends to fail: **declared-but-unverified feature lists**
(the era gates, the website's feature grid), **generated visual assets
with no cleanup pass** (the `_final_v2`/`_fixed` pile), **documentation
written once and never checked against the repo again** (the README's
`native_client/` claim, the wrong link baked into every page), and **a
pattern of shipping first and discovering the gap later** (the 16%
fix-commit rate).

The throughline across every pocket on this list is the same one from the
other two audits: something that *reads* as complete — a feature in a
table, a link in a footer, a directory in a README — turns out to have
nothing, or the wrong thing, behind it. That's the actual definition of
slop worth using here, and by that definition it's real, it's
concentrated, and most of what's been found is now either fixed or
explicitly tracked rather than sitting there unnoticed.

## Fixed in this pass

- **`native_client/android/.gradle/` cache removed from git entirely.**
  The directory had no other tracked content, so `native_client/` is now
  gone from the tree rather than sitting there half-documented. Checked
  first that nothing else referenced actual client code inside it —
  there wasn't any.
- **`.gitignore` broadened from `android/.gradle/` to `**/.gradle/`.**
  The narrow rule is exactly how this happened — it only covered the
  top-level `android/` tree, not the second one nested under
  `native_client/`. The broad rule can't be evaded by a build happening
  to run somewhere new.
- **The dead `public/downloads/assets/` folder removed** — 12MB,
  confirmed zero references anywhere in the codebase, and separately
  confirmed *unreachable* regardless: `/downloads/` is routed only
  through a handler that resolves the request to `filepath.Base()`, which
  can never descend into a subdirectory. This wasn't "some duplicates
  mixed with real assets" as first suspected — the entire folder,
  `_final_v2` files and all, had no path by which anything could ever
  serve it.
- **README's directory table corrected** — dropped the `native_client/`
  row (now truthfully empty) and added `desktop/`, the real Wails app
  that was never listed at all.
- **Two Go tool comments and two `ws_handlers.go` comments** that
  referenced `native_client` as if it contained real client code, updated
  to describe what's actually there (the web client's `key_request`
  handling in `App.tsx`, also what `desktop/` embeds).

## Still open

- `Phaze.apk` (45MB) is still committed directly to the repo rather than
  shipped through GitHub Releases — same root cause `website-audit.md`
  already flagged: `release.yml` has never fired. Every future clone
  carries that blob in history regardless of whether the file is later
  replaced. Fixing this is the same work as fixing the download page for
  real, not a separate task.
