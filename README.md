# Phaze

Cross-platform Skype revival. DMs, group spaces, voice/video calls, screen share, end-to-end encryption. Free.

**Live at [phazechat.world](https://phazechat.world)**

---

## What's in the repo

| Directory | What it is |
|---|---|
| `nexus_server/` | Go WebSocket relay — auth, messaging, calls, file uploads, spaces |
| `web/` | React/TypeScript web app (Vite) |
| `android/` | Android app — Kotlin + Jetpack Compose |
| `desktop/` | Desktop app — Wails (Go + web frontend) |

## Running locally

**Server:**
```bash
cd nexus_server
go build -o phaze-nexus .
./phaze-nexus
```

**Web client:**
```bash
cd web
cp .env.example .env.local   # set VITE_NEXUS_WS=ws://localhost:8080/ws
npm install
npm run dev
```

**Android:** Open `android/` in Android Studio and run on a device or emulator.

## Self-hosting

Run `phaze-nexus` behind nginx/Caddy with TLS. A `docker-compose.yml` is in `nexus_server/`.

Set `PHAZE_TURN_URL` + `PHAZE_TURN_USERNAME` + `PHAZE_TURN_PASSWORD` for a TURN server, or `PHAZE_TURN_URL` + `PHAZE_TURN_SECRET` for coturn with `use-auth-secret`.

## Deployment

Fly.io — `fly deploy -a skype7-reborn --dockerfile nexus_server/Dockerfile`

---

*Not affiliated with Microsoft or Skype.*
