# Phaze

A Skype revival for web, Android and desktop. Direct messages, group chats and spaces, voice and video calls, screen share, stories and a shared whiteboard, with the look and feel of the Skype 3 to 8 eras. Free.

**Live at [phazechat.world](https://phazechat.world)** · Desktop downloads (Linux, Windows): [GitHub releases](https://github.com/jakes1345/phazechat.world/releases)

---

## What it does

- **Direct messages are end-to-end encrypted.** Messages are encrypted in the client with NaCl `box` before they reach the server. Each contact's key is pinned by fingerprint, and you can back up your own keys.
- **Group chats and spaces.** Group chats are **not** end-to-end encrypted, and the apps say so on screen. They support the classic Skype slash commands.
- **Voice and video calls** with screen share, relayed through a TURN server you can self-host.
- **Stories** that disappear after 24 hours, a **shared whiteboard**, presence and mood messages, and house-style emoticons and sounds.
- **Era themes.** The app can restyle itself as Skype 3, 4, 5, 6, 7 or 8 and limit its features to what that version had. The research behind it is in [`docs/skype-eras/`](docs/skype-eras/).
- **Referral rewards.** Invite a friend, earn a crate with a random cosmetic. Rewards are earned only and nothing is for sale. See [`docs/rewards.md`](docs/rewards.md).
- **Accounts.** Email verification, TOTP two-factor sign-in and device management.
- **Data minimization.** Unverified accounts are deleted after 7 days and channel messages after 30 days (configurable).
- **Nova**, an AI helper bot that answers questions and says it is a bot if you ask.

## What's in the repo

| Directory | What it is |
|---|---|
| [`nexus_server/`](nexus_server/) | Go server: WebSocket relay, auth, messaging, calls, uploads, stories, rewards and a public status page at `/status` |
| [`web/`](web/) | React 19 and TypeScript web app (Vite) |
| [`android/`](android/) | Android app in Kotlin and Jetpack Compose |
| [`desktop/`](desktop/) | Desktop app built with Wails (Go and the web frontend), with a Linux tray icon |
| [`nova_bot/`](nova_bot/) | Nova, the AI helper bot |
| [`infra/`](infra/) and [`scripts/`](scripts/) | coturn (TURN) config and Play Store assets |
| [`docs/`](docs/) | Design notes, rewards, and the Skype-era research |

## Running locally

You need Go 1.26 or newer and Node.js.

The quickest way to start the server is the helper script, which builds Nexus and serves it on port 8080:

```bash
./run_local_phaze.sh
```

To run the pieces yourself:

```bash
# Server
cd nexus_server
go build -o phaze-nexus .
DB_PATH=./nexus.db PORT=8080 ./phaze-nexus

# Web client (in another terminal)
cd web
cp .env.example .env.local   # VITE_NEXUS_WS=ws://127.0.0.1:8080/ws
npm install
npm run dev
```

**Android:** open `android/` in Android Studio and run it on a device or emulator. Copy `android/local.properties.example` to `android/local.properties` first.

**Desktop:** `make desktop` builds the Wails app (needs [Wails](https://wails.io)).

## Building and testing

`make help` lists every target. The ones you'll use most:

| Command | What it does |
|---|---|
| `make test` | Go server tests |
| `make verify` | Server tests, `go vet`, web build and ESLint |
| `make nexus` | Build the server to `bin/phaze-nexus` |
| `make web-build` | Production build of the web app |
| `make android` | Debug APK |
| `make desktop` | Desktop app |

The web app also has `npm test` (Vitest) and `npm run test:e2e` (Playwright).

## Self-hosting

Run Nexus behind nginx or Caddy for TLS. [`nexus_server/docker-compose.yml`](nexus_server/docker-compose.yml) is a starting point, and a container image is published to `ghcr.io/jakes1345/phaze-nexus` for each `v*` tag. Copy [`nexus_server/.env.example`](nexus_server/.env.example) and set:

- `Phaze_ALLOWED_ORIGINS`: the web origins allowed to open a WebSocket to your server.
- TURN for calls: `PHAZE_TURN_URL` plus either `PHAZE_TURN_SECRET` (coturn with `use-auth-secret`) or `PHAZE_TURN_USERNAME` and `PHAZE_TURN_PASSWORD`. A coturn config is in [`scripts/phaze_turnserver.conf`](scripts/phaze_turnserver.conf).

## Deployment

phazechat.world runs on Fly.io. Pushes to `master` that touch `nexus_server/`, `web/` or `fly.toml` deploy automatically (see [`.github/workflows/fly-deploy.yml`](.github/workflows/fly-deploy.yml)). To deploy by hand:

```bash
fly deploy -a skype7-reborn --dockerfile nexus_server/Dockerfile
```

Pushing a `v*` or `beta*` tag, or publishing a release, runs [`release.yml`](.github/workflows/release.yml), which builds the platform clients and attaches them to the GitHub release.

## License

[MIT](LICENSE). Not affiliated with Microsoft or Skype.
