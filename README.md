# Phaze

[![CI](https://github.com/jakes1345/phazechat.world/actions/workflows/ci.yml/badge.svg)](https://github.com/jakes1345/phazechat.world/actions/workflows/ci.yml)

Phaze is a chat app for direct messages, group chats, community spaces and calls, with end-to-end encrypted DMs. It runs in the browser, on Android and as a desktop app, and the look is inspired by classic Skype.

The hosted version is at [phazechat.world](https://phazechat.world). This repo holds everything behind it: the Go server, the web app, the Android app and the desktop wrapper.

## What's in the repo

| Path | Contents |
|---|---|
| `nexus_server/` | The Go server ("Nexus"). One binary handles the WebSocket relay, accounts, file uploads, the admin portal and the marketing pages in `templates/`. Data lives in SQLite. |
| `web/` | The web client. React 19 and TypeScript, built with Vite. The server serves the built app at `/web/`. |
| `android/` | Native Android app in Kotlin and Jetpack Compose. Package `world.phazechat.app`, minSdk 26. |
| `desktop/` | Wails v2 desktop app that embeds the web client build. |
| `nova_bot/` | Optional bot account backed by Gemini. The container starts it only when `NOVA_PASSWORD` and `GEMINI_API_KEY` are set. |
| `packaging/` | Draft Debian, Flatpak and winget manifests. Not used by CI yet. |
| `docs/` | Design notes, audits and research. Written for development, not as user documentation. |
| `Makefile`, `VERSION` | Build targets and the version stamped into the server binary. |
| `cloudflare/` | Cloudflare Worker and Container config that runs the hosted server. |

## Features

Everything below is in the code today. Where only one client has a feature, that's noted.

Accounts and security
- Sign-up with email verification. Disposable email domains are rejected.
- Optional TOTP two-factor authentication and password reset by email.
- Sign-ins from a new device have to be approved, either from a device that's already signed in or with a code sent by email.
- Sign in on another device by scanning a QR code. Active sessions can be listed and revoked.
- Account deletion and a JSON export of your data (`/api/v1/export`).

Messaging
- One-to-one DMs, end-to-end encrypted when both sides have exchanged keys (details below).
- Edit, delete, reactions, typing indicators and read receipts.
- File attachments up to 25 MB.
- Group chats. The creator can add, remove and rename. These are not end-to-end encrypted, and the web client says so in the chat header.
- Contacts with friend requests, blocking, contact groups, presence and mood messages.
- Import contacts and message history from a Skype data export (.zip, up to 100 MB).

Spaces
- Community servers with text channels, pinned messages, reactions and edits.
- Voice channels (up to 8 people, with camera and screen sharing) and a shared whiteboard on the web.
- Channel messages are deleted after 30 days by default.

Calls and media
- Voice and video calls between friends. Calls ring every device you're signed in on.
- Group calls from a chat (web): invite a friend into a voice room; the friends you invite can bring in their friends, up to 8 people.
- Calls, voice channels and group calls run over WebRTC directly between the people in them, through Cloudflare's TURN relay when a direct path is blocked. Voice rooms are a mesh: everyone sends their stream to everyone else, which is why they're capped at 8. Media never passes through the Phaze server.
- Live streams (web only): broadcast your camera or screen to viewers over direct WebRTC connections.
- Remote screen sessions (web only): share your screen with someone using a 6-digit code, with a pointer overlay and file transfer over a WebRTC data channel.

Other
- Stories that expire after 24 hours.
- Web push notifications (VAPID) and Android push via Firebase Cloud Messaging.
- Referral rewards: inviting a friend who verifies their email earns a crate of cosmetic items. Nothing is for sale. See `docs/rewards.md`.
- Six visual themes, labelled Phaze 1 to Phaze 6+, modelled on classic Skype releases from 2007 to 2018. In the web app the theme also decides which features are shown. Spaces, live streams, reactions, read receipts and remote sessions only appear on Phaze 6+. The default theme is Phaze 5.

### Known gaps

These are the things I know are broken or partial right now.

- Android has no voice channels or group calls yet: a voice channel opens as a text channel there.
- If one side of a 1:1 call runs an old app from before built-in calls, the server still hands both sides a `meet.jit.si` room. The privacy policy at `/privacy` explains this.
- The Android app is hardwired to `phazechat.world` (`NexusClient.kt` and `PhazeViewModel.kt`). There is no server setting.
- There is no macOS build. CI builds Windows and Linux desktop binaries only.

## End-to-end encryption

DMs use NaCl `box`: X25519 key agreement with XSalsa20-Poly1305. The web client uses `tweetnacl` (`web/src/e2ee.ts`) and Android uses Lazysodium, a libsodium binding (`android/.../crypto/E2EE.kt`). The two produce the same wire format, so web and Android can read each other's messages.

How it works:

1. Each install generates its own keypair on first run. The web client keeps it in `localStorage`; Android keeps it in app-private SharedPreferences.
2. Public keys are never stored on the server. When you open a chat, your client sends a `key_request` and the contact's client replies with its public key. The server only forwards these between friends.
3. Each message gets a random 24-byte nonce. The body goes over the wire as `E2EE:` followed by hex-encoded nonce and ciphertext. The server stores and relays that string as-is.
4. The web client pins each contact's key fingerprint (first 8 bytes of SHA-256 of the key) the first time it sees it. If the key later changes, it refuses the new key and shows a warning. Android doesn't pin keys yet.

Key backup is optional. Your keypair is encrypted on the device with a key derived from a PIN (PBKDF2-SHA256, 200,000 iterations, AES-256-GCM) and only the ciphertext, salt and iteration count are uploaded. Restoring the backup on a new device lets you keep the same identity, which matters because a new keypair looks like a key change to contacts using the web client.

What isn't encrypted end to end:

- A DM sent before your client has the contact's key. Both clients fall back to plaintext in that case. On the web, the message box shows a lock icon once encryption is active.
- Attachments. The file itself is uploaded unencrypted under a random name. Only the message carrying its URL is encrypted.
- Group chats, Spaces channels, Stories and imported Skype history.
- Calls (see above).
- Metadata. The server knows who talks to whom and when.

## Running locally

You need Go 1.26 and Node 22 (the versions CI uses). Android needs Android Studio or the Android SDK with JDK 17 or newer.

### Server

```bash
cd nexus_server
PHAZE_DEVICE_VERIFICATION=0 go run .
```

It listens on `0.0.0.0:8080` and creates `nexus.db` in `nexus_server/`. Setting `PHAZE_DEVICE_VERIFICATION=0` skips the new-device approval step, which is useful when no mail provider is set up.

Without a mail provider, emails aren't sent. The server prints them to its log as `[MAIL-SIM]` lines, so you can copy the verification link from there. You can also create a verified account directly:

```bash
cd nexus_server
go run ./cmd/seed-admin -db ./nexus.db -username dev -password test1234 -email dev@example.com -admin
```

### Web client

In a second terminal:

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173/web/. The Vite dev server proxies `/ws`, `/api`, `/uploads` and `/public` to `http://127.0.0.1:8080`, so no `.env` file is needed. To point the dev proxy somewhere else, set `VITE_DEV_NEXUS_ORIGIN`. To make the client connect to a specific WebSocket URL, set `VITE_NEXUS_WS` (see `web/.env.example`).

To have the Go server serve a production build instead:

```bash
make web-build
cd nexus_server && PHAZE_WEB_DIR=../web/dist go run .
```

Then open http://localhost:8080/web/.

### Android

1. Copy `android/local.properties.example` to `android/local.properties` and set `sdk.dir`. The signing fields are only needed for release builds.
2. The Google Services Gradle plugin needs `android/app/google-services.json`. Use the file from your own Firebase project; `google-services.json.example` shows the expected shape. Debug builds use the package name `world.phazechat.app.debug`, so register that as well as `world.phazechat.app`. Push notifications won't work without a real project.
3. Run `make android` for a debug APK, or open `android/` in Android Studio.

The app talks to the production server at `wss://phazechat.world/ws`. To use a local server, change `WS_URL` in `NexusClient.kt` and the `https://phazechat.world/...` URLs in `PhazeViewModel.kt`.

### Desktop

The desktop app is the web client in a Wails window. You need the Wails CLI (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`). On Linux you also need `libgtk-3-dev` and `libwebkit2gtk-4.1-dev`.

```bash
make desktop
```

This builds the web client with `VITE_BASE=/`, copies it into `desktop/dist` and produces `desktop/build/bin/Phaze`. The Makefile expects the Wails binary at `~/go/bin/wails`. `desktop/build.sh` does the same thing, and `desktop/build.sh --dev` starts the Vite dev server for use with `wails dev`.

The embedded web client reads `VITE_NEXUS_WS` at build time to find the server.

### Tests and other make targets

```bash
make test     # go test ./... in nexus_server
make vet      # go vet
make verify   # tests, vet, web build, vitest and ESLint
```

`cd web && npm run test:e2e` runs the Playwright smoke test that CI uses. `make help` lists every target, including `nexus` (builds `bin/phaze-nexus`), `android-aab`, `build-all` and `phaze-assets` (regenerates the sounds and emoticons).

## Configuration

The server reads all of its configuration from environment variables. Everything is optional; the defaults are fine for local development.

Some variable names start with `Phaze_` in mixed case rather than `PHAZE_`. That's how the code reads them, so type them exactly as shown.

### Core

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | HTTP port. |
| `BIND_ADDR` | `0.0.0.0` | Listen address. |
| `DB_PATH` | `nexus.db` | SQLite file. The Docker image sets `/data/nexus.db`. |
| `PHAZE_UPLOAD_DIR` | `public/uploads` | Where attachments are stored. Set it to a persistent volume in production. |
| `PHAZE_WEB_DIR` | `web` | Directory holding the built web client, served at `/web/`. |
| `PHAZE_ASSET_ROOT` | auto | Working directory containing `templates/` and `public/`. Only needed when the binary can't find them itself. |
| `Phaze_ALLOWED_ORIGINS` | unset | Comma-separated browser origins allowed to open a WebSocket. When unset, any origin is allowed and the server logs a warning. |
| `PHAZE_TRUST_PROXY_HEADER` | unset | Header holding the real client IP, for example `X-Phaze-Client-IP` behind the Cloudflare Worker. Without it, rate limits and stored IPs see the proxy's address. |
| `PHAZE_DEVICE_VERIFICATION` | on | Set to `0` to turn off new-device approval. |
| `PHAZE_CHANNEL_RETENTION_DAYS` | `30` | How long Spaces channel messages are kept. |

### TURN

The server hands TURN credentials to clients when they sign in. They're used by every WebRTC feature: calls, voice channels, group calls, live streams and remote screen sessions. There are three ways to set it up.

Cloudflare Realtime TURN, which the hosted instance uses. The server fetches short-lived `turn.cloudflare.com` credentials and refreshes them in the background:

| Variable | Purpose |
|---|---|
| `PHAZE_CF_TURN_KEY_ID` | Token ID of a TURN key (Dashboard > Realtime > TURN Server). |
| `PHAZE_CF_TURN_API_TOKEN` | That key's API token. |

Static credentials, for a hosted TURN provider:

| Variable | Purpose |
|---|---|
| `PHAZE_TURN_URL` | TURN URL. In this mode it can be a comma-separated list. |
| `PHAZE_TURN_USERNAME` | Username. |
| `PHAZE_TURN_PASSWORD` | Password. |

Time-limited credentials, for your own coturn with `use-auth-secret`:

| Variable | Purpose |
|---|---|
| `PHAZE_TURN_URL` | For example `turn:turn.example.com:3478`. |
| `PHAZE_TURN_SECRET` | Must match coturn's `static-auth-secret`. |
| `PHAZE_TURN_SHORT_TERM` | `true` makes credentials last 10 minutes instead of 24 hours. |

Cloudflare wins over the other two when it's set and reachable; between those two, static credentials win. With neither, clients fall back to a public STUN server and connections between some networks will fail.

### Email

The server tries Resend, then Brevo, then SMTP, using whichever is configured first.

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY`, `RESEND_SENDER` | Resend API. |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` | Brevo API. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Plain SMTP. |

### Push notifications

| Variable | Purpose |
|---|---|
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web push. |
| `FCM_SERVICE_ACCOUNT_JSON` | Firebase service account JSON, for Android push. |

### Admin and moderation

| Variable | Purpose |
|---|---|
| `PHAZE_ADMIN_PATH` | URL of the admin portal. Defaults to `/nexus-cmd`. |
| `PHAZE_ADMIN_USERS` | Comma-separated usernames promoted to admin on every boot. |
| `PHAZE_ADMIN_IPS` | Comma-separated IPs or CIDRs allowed to reach admin endpoints. Needs `PHAZE_TRUST_PROXY_HEADER` behind a proxy, or every request gets a 404. |
| `PHAZE_METRICS_TOKEN` | If set, `/metrics` requires `Authorization: Bearer <token>`. |
| `PHAZE_BLOCKED_EMAIL_DOMAINS` | Extra comma-separated email domains to refuse at sign-up. |
| `PHAZE_BLOCK_VPN` | Set to `1` to refuse sign-ups from VPN and datacenter IPs. Uses `PROXYCHECK_KEY` and `IPAPI_KEY` for lookups. |

### Backups

The container entrypoint (`nexus_server/entrypoint.sh`) runs the server under [Litestream](https://litestream.io) when `BUCKET_NAME` or `LITESTREAM_BUCKET` is set. It restores the database from the bucket on boot and then streams every change to it. The replica settings in `litestream.yml` read `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. On Cloudflare these point at the R2 bucket; see [`cloudflare/README.md`](cloudflare/README.md).

### Optional integrations

| Variable | Purpose |
|---|---|
| `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM` | SMS through Twilio. Without them, SMS is written to the log as `[SMS-SIM]`. |
| `PHAZE_ENABLE_PSTN`, `Phaze_APP_URL` | `PHAZE_ENABLE_PSTN=true` turns on outbound calls to phone numbers through Twilio. Off by default. |
| `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` | Either one enables the support chat assistant at `/api/v1/support/chat`. |
| `NOVA_USERNAME` | Username of the Nova bot. The server adds it to public spaces. |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | Error reporting. |
| `PHAZE_RELEASE_REPO`, `GITHUB_TOKEN`, `Phaze_LATEST_VERSION`, `Phaze_UPDATE_URL` | Update manifest served at `/version`. The repo defaults to `jakes1345/phazechat.world`. |
| `BMC_URL`, `BMC_WEBHOOK_SECRET`, `PHAZE_SUPPORT_EMAIL` | Donation link, Buy Me a Coffee webhook check, and the support address shown in the app. |
| `PHAZE_GSC_VERIFICATION`, `PHAZE_BING_VERIFICATION`, `PHAZE_YANDEX_VERIFICATION`, `INDEXNOW_KEY` | Search engine site verification. |

### Web client build variables

`VITE_NEXUS_WS` (WebSocket URL), `VITE_BASE` (asset base path, `/web/` by default), `VITE_DEV_NEXUS_ORIGIN` (dev proxy target), `VITE_PHAZE_ASSET_BASE`, `VITE_SENTRY_DSN`, `VITE_SENTRY_ENV` and `VITE_BUILD_VERSION`.

## Self-hosting

The production image is built from `nexus_server/Dockerfile`. It compiles the server, the web client, the admin and supporter CLIs and the Nova bot, and adds a pinned Litestream binary. The build context has to be the repo root:

```bash
docker build -f nexus_server/Dockerfile -t phaze-nexus .
docker run -p 8080:8080 -v nexus_data:/data \
  -e Phaze_ALLOWED_ORIGINS=https://chat.example.com \
  phaze-nexus
```

CI also publishes this image to GitHub Container Registry on every push to `master` and on version tags (`.github/workflows/docker.yml`), as `ghcr.io/jakes1345/phazechat.world-nexus`.

Put it behind a reverse proxy that terminates TLS and passes WebSocket upgrades through on `/ws`. Set `PHAZE_TRUST_PROXY_HEADER` to whatever header your proxy uses for the client IP. `/health` returns the server's status for health checks, and `/status` is a public status page.

### TURN server

The hosted instance uses Cloudflare's TURN service (see [TURN](#turn)), so there is nothing to run. To host your own instead, `scripts/phaze_turnserver.conf` is a coturn config for a VPS. Replace `static-auth-secret`, then set `PHAZE_TURN_URL=turn:<your-turn-host>:3478` and the same value as `PHAZE_TURN_SECRET` on the Nexus server.

## Deploying to Cloudflare

The hosted instance runs as a Cloudflare Container behind a Worker (`cloudflare/`). The container's disk is wiped on restart, so the database replicates to an R2 bucket with Litestream and uploads and avatars are stored in the same bucket.

`.github/workflows/cloudflare-deploy.yml` deploys on every push to `master`. Account setup, the secrets it needs and how to start from an existing database are in [`cloudflare/README.md`](cloudflare/README.md).

## Releases

`VERSION` holds the version stamped into the server binary. The Android version lives in `android/app/build.gradle.kts` (`appVersionName` and `appVersionCode`) and is bumped by hand.

Pushing a `v*` tag runs `.github/workflows/release.yml`. It creates a GitHub release and attaches a signed Android APK and AAB, a Windows NSIS installer and a Linux amd64 binary. The Android job expects `GOOGLE_SERVICES_JSON`, `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASS`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASS` as repository secrets.

## License

MIT. See [LICENSE](LICENSE).

Phaze is an independent project. Not affiliated with Microsoft or Skype.
