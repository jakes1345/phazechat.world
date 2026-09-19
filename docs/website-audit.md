# The actual website — an audit

Covers the public marketing site (`nexus_server/templates/*.html`, served at
phazechat.world by the Go server) — separate from `docs/skype-era-*.md` and
`docs/livekit-evaluation.md`, which cover the retro-themed chat client
(`web/src/`).

## What's actually live

Nine pages, all served as static files by `nexus_server/main.go` handlers:
`landing.html` (`/`), `download.html`, `features.html`, `rates.html`,
`about.html`, `support.html`, `privacy.html`, `terms.html`, `legal.html`.
There is no other public-facing site — `infra/landing/index.html` isn't
deployed anywhere (see GitHub Pages, below, for the other thing that turned
out not to be a real website either).

## Fixed this pass

### 1. The GitHub repo link was wrong on every single page

`jakes1345/phaze` — a repo that has never existed — was hardcoded in
`landing.html`, `download.html`, `about.html`, `support.html`, `terms.html`,
and in `nexus_server/main.go`'s own in-app update-check handler. 16
occurrences total. This broke:

* Windows/Linux download buttons (`download.html`)
* The "Contributing" link (`about.html`)
* All six "Open an issue" support-card links, plus the support search box,
  which built a GitHub issue-search URL against the dead repo
  (`support.html`)
* The GitHub footer link and "View source on GitHub" CTA (`landing.html`)
* The dependency-licenses attribution link (`terms.html`)
* The app's own auto-update check (`main.go`'s `versionHandler`) — every
  client asking "is there a new version" was silently asking GitHub about a
  404 and concluding "no" forever

Fixed everywhere to `jakes1345/phazechat.world`.

### 2. Fixing the repo name didn't fix downloads, because nothing has ever been published

`jakes1345/phazechat.world` has zero tags and zero releases. `release.yml`
(the workflow that would build and publish Windows/Linux/macOS/Android
artifacts) has never run — no `v*` tag has ever been pushed.

So `download.html`'s Windows/Linux buttons, even pointed at the correct
repo, resolved to GitHub's own 404 for a nonexistent "latest release." The
page's JS silently swallowed this before; there was no way for a visitor to
tell "broken link" from "nothing to download yet."

Fixed by making the state explicit: Windows, macOS, and Linux all now say
**"Coming soon"** with a line underneath — *"No build published yet — build
it from source or use the web app"* — linking to the real repo. That line is
JS-controlled (`wireButton()`), not static copy, so a real release hides it
automatically instead of needing someone to remember to delete it.

**Android is the one platform that actually works today** — `/downloads/
Phaze.apk` is a real file, checked into the repo and served directly by
`fileDownloadHandler`, independent of GitHub Releases.

Cutting a real release (getting `release.yml` to actually fire, sign, and
publish Windows/macOS/Linux builds) is out of scope for this pass — this
only fixes the site from lying about it.

### 3. GitHub Pages was publishing internal engineering notes to a public URL

`.github/workflows/pages.yml` deploys `./docs` to GitHub Pages on every push
to master. `./docs` contains this project's own working notes — era-theme
research, the gaps audit, the LiveKit evaluation, this file, and a
`superpowers/` folder of internal audits and specs — and has no
`index.html` and no CNAME.

So this workflow was either 404ing on every run, or (if GitHub's default
Jekyll processing engaged) serving a rendering of a folder of engineering
markdown as a "website," publicly, on every commit to these docs.
phazechat.world itself is unaffected (that domain resolves to the Go
server, not GitHub Pages), but the default `<owner>.github.io/<repo>` URL
was live the whole time.

Fixed by removing the automatic trigger (kept `workflow_dispatch` so the
workflow isn't deleted, in case `./docs` is ever deliberately turned into a
real static site) with a comment explaining why.

### 4. A fabricated flagship feature: automatic chat-history import

The homepage had a dedicated section — "Don't start over. Pick up where you
left off." — with a specific four-step walkthrough ("In Settings, go to
Chat Import and upload the zip. Messages show up in your DMs.") and a row
in the competitor-comparison table claiming this as a checkmark Phaze has
and WhatsApp/Discord/Telegram/Signal don't.

There is no such feature — zero matches anywhere in `web/src/` or
`nexus_server/` for chat import, history import, or anything resembling it.
The UI flow described was specific enough that a reader would go looking
for a "Chat Import" option in Settings that doesn't exist.

Removed the fabricated walkthrough, its duplicate as a feature-grid card,
and the comparison-table row. Replaced the homepage section with an honest
version of the same pitch — switching is easy because *setup* is trivial (no
phone number, ~30 seconds), not because of a migration tool that doesn't
exist.

### 5. Calls were described as peer-to-peer. They currently aren't.

`about.html`, `features.html`, and `privacy.html` all described voice/video
calls as "WebRTC peer-to-peer." Per `docs/livekit-evaluation.md`, that's not
what happens: `CallScreen.tsx` and `VoiceRoom.tsx` both hand the call off to
a room on the public Jitsi Meet service (`meet.jit.si`). A direct P2P
connection (even TURN-relayed) never puts a third party's server in the
media path in a way that could see the raw call; a Jitsi Meet room does.

This mattered most in `privacy.html`, which lists third-party services with
access to user data (Firebase, an SMTP provider, Twilio, the TURN relay,
hosting) and didn't list Jitsi, despite Jitsi's servers currently handling
every call and voice-channel's actual audio/video.

Fixed: corrected the "peer-to-peer" language in all three files, and added
a third-party disclosure entry for Jitsi to `privacy.html` Section 5,
linking to Jitsi's own privacy policy and stating that this is being
changed. Remove that entry once calls actually move off Jitsi — the work
scoped in `docs/livekit-evaluation.md` and `docs/skype-era-gaps.md` §2.

Not touched, on purpose: "Screen Share" and "Voice & Video Calls" as
*feature* claims aren't false — Jitsi Meet genuinely provides both once
you're in a room. The problem was never "this doesn't work," it was "this
isn't private the way the rest of the page implies," which is now
disclosed.

### 6. bcrypt cost didn't match the number the privacy policy promises

`privacy.html` states passwords are hashed "with bcrypt hashes (cost factor
12)." Every hashing call site used `bcrypt.DefaultCost`, which in Go's
bcrypt package is 10, not 12.

Raised the code to match the promise: added a `bcryptCost = 12` constant
and pointed all four `bcrypt.GenerateFromPassword` call sites at it. Safe to
change unilaterally — bcrypt stores its own cost factor inside the hash
string itself, so raising the constant only affects passwords hashed from
now on; existing stored hashes still verify correctly at whatever cost they
were created with.

### 7. A dead footer link

`landing.html`'s footer linked `/security` — no such route, no such
template. Repointed at `/privacy`, which already covers the same ground
(`support.html`'s "Security & Privacy" card already links there instead of
`/security`).

## Checked and found accurate

* **E2EE for DMs is real** — NaCl box (Curve25519 + XSalsa20-Poly1305), keys
  generated client-side, ciphertext-only storage, confirmed in
  `nexus_server/main.go`'s message-handling code.
* **2FA/TOTP is real** — full enable/confirm/backup-code flow, both server
  and client side.
* **Push notifications are real** — VAPID keypair-based Web Push, wired
  through a service worker, gated on `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`.
* **Firebase Cloud Messaging, for the native Android app specifically, is
  real** — `PhazeFCMService.kt`, Firebase Gradle dependencies, and manifest
  entries all exist.
* **The rates page is honest** — no landline-calling claims, plainly states
  Phaze doesn't bridge to the phone network, and explains funding (a small
  Fly.io instance) rather than implying a large hidden operation.
* **The site's tone is fine as-is** — "Not 'we pinky promise not to,'" "no
  BS," "We built Phaze because we wanted Skype back." The fixes above kept
  that voice; the problem was specific false claims, not the tone.

## Still open

* **No real release has ever been cut.** Fixing the download page makes it
  honest; it doesn't make Windows/macOS/Linux builds exist. That needs
  `release.yml` actually firing against a real tag, a successful desktop
  build, and (for a Windows build people will trust) code signing.
* **Calls still route through Jitsi.** The privacy policy is honest about
  it now; the underlying architecture isn't fixed — that's the LiveKit
  work.
* **The Google Play listing (`world.phazechat.app`) couldn't be confirmed
  live** — fetching it returned a 404, but Play Store listings sometimes
  don't render for a plain fetch even when real, so this is unconfirmed
  rather than confirmed-broken. Worth a manual check from a browser/Play
  Store app.
