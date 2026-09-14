# Replacing Jitsi with LiveKit — an evaluation

Asked directly: should Phaze replace its current calling stack with LiveKit?
This is research, not a decision — nothing below has been implemented.

## What's actually running today

Checked the code rather than assuming. Three different things are
happening under the umbrella of "calling," and they're in worse shape
than "it's all Jitsi":

1. **1:1 calls** (`CallScreen.tsx`) — an `<iframe>` pointed at
   `meet.jit.si`. The server (`ws_handlers.go`) does real signaling work
   to hand out a room ID (`call_offer` → `call_jitsi`), then throws that
   work away — the comment at `ws_handlers.go:1681` literally reads
   *"No-op: WebRTC ICE negotiation replaced by Jitsi."*
2. **Group voice channels** (`VoiceRoom.tsx`, the actual Discord-style
   Spaces feature) — also a bare `meet.jit.si` iframe. Worse: the
   component destructures `{ channelName, channelId }` from its props and
   **silently ignores** `me`, `send`, `subscribe`, and `turn` — the app's
   own signaling and TURN plumbing were built for this and never wired
   up.
3. **Live broadcasting** (`LivePage.tsx`) is the one place with real,
   home-grown WebRTC — and it's a **mesh**: `onViewerJoined` opens one
   full `RTCPeerConnection` per viewer straight from the broadcaster's
   browser. That's fine for a handful of viewers; it means the
   broadcaster's own upload bandwidth and CPU scale linearly with viewer
   count, with no ceiling above "however many peer connections one
   browser tab can hold open."

So the honest framing isn't "replace Jitsi with LiveKit" — it's "there is
no real group-call or scalable-broadcast infrastructure in this app yet,
and the question is what to build it on."

## What LiveKit is

An open-source WebRTC **SFU** (Selective Forwarding Unit), Apache 2.0
licensed, server written in Go on top of Pion. A participant publishes
one encoded stream; the server forwards it to every subscriber without
re-encoding. This is architecturally the thing between "everyone connects
to everyone" (what `LivePage.tsx` does) and "a full MCU that transcodes
everything" (expensive, nobody does this anymore) — it's also what Jitsi
Videobridge does, just with a different design philosophy.

- **Client SDKs**: JS/browser, Swift, Android, Flutter, React Native,
  Rust, Unity, and others.
- **Server SDKs**: Go, Node, Python, Ruby, Java/Kotlin, Rust, and
  community PHP/.NET. **The Go SDK matters specifically here** —
  `nexus_server` is already Go, so token generation and room management
  would sit naturally alongside the existing WebSocket handlers rather
  than needing a second language runtime.
- **React**: `@livekit/components-react` ships hooks —
  `useTracks()`, `useParticipants()`, `useLocalParticipant()` — that hand
  back track references and participant state with no opinion on markup.
  You render the tiles, the buttons, the layout. This is the load-bearing
  fact for this project specifically: **Jitsi's iframe cannot be reskinned
  per era — you get Jitsi's UI or nothing. LiveKit gives you the raw
  media and metadata and nothing else, which is exactly the shape needed
  to actually build the six-era call window that's currently parked as
  its own task.**
- **Simulcast + Dynacast**: the client publishes 2-3 quality layers per
  video track automatically; the SFU forwards whichever layer suits each
  subscriber's bandwidth, and the publisher stops encoding layers nobody's
  subscribed to. Real bandwidth adaptation, which the current mesh
  implementation has none of.
- **Egress**: optional separate service for recording a room to MP4/HLS
  or restreaming to RTMP (YouTube/Twitch) — relevant if "record a call"
  or "restream a Live broadcast" is ever wanted, not required to run
  LiveKit at all.

Independent sources put a single 4-vCPU/16GB LiveKit node at 200+
participants versus roughly 75-100 for the equivalent Jitsi Videobridge —
though at Phaze's actual scale (a handful of concurrent calls, not
hundreds) this comparison is mostly irrelevant; both would be wildly
oversized for what this app needs today. The real differentiators here
are the license, the Go SDK fit, and the custom-UI capability — not raw
throughput.

## The part that actually matters for this deployment: Fly.io and UDP

This is the finding worth weighing most heavily, and it only shows up by
reading the repo's own infra rather than LiveKit's marketing.

`infra/coturn/fly.toml` already had to work around a real constraint:
**Fly.io's proxy requires every UDP port declared as its own
`[[services]]` block** — there's no "open a range" primitive the way a
security group on a plain VPS gives you. The existing TURN relay's own
comments show the compromise that forced: a hand-narrowed 40-port range
(`49160`–`49200`... ish), annotated "~2 concurrent calls per port," with
a paid metered.ca TURN fallback for anything beyond that.

LiveKit's default media port range is **10,000 UDP ports**
(`50000`–`60000`). Declaring that as individual Fly service blocks isn't
practical. Three real ways to actually run it:

1. **Narrow LiveKit's own `port_range_start`/`port_range_end`** in its
   YAML config to something Fly can enumerate — the same trick the coturn
   deployment already uses. LiveKit supports this natively; it's a config
   value, not a patch. Capacity would be similarly constrained
   (roughly proportional to port count), but at Phaze's real scale that's
   likely fine.
2. **Run LiveKit's media plane on a plain VPS instead of Fly** — a small
   Hetzner/DigitalOcean box with a real public IP and a security group
   that allows the full UDP range in one rule. Simpler in theory, but it
   means introducing a second hosting provider into a deployment that's
   currently all-Fly, and a second thing to keep patched and paid for.
3. **Lean on LiveKit's TURN/TLS fallback** (port 5349, needs its own
   domain + TLS cert) as the primary path for anyone behind a restrictive
   NAT, and treat the direct UDP range as an optimization rather than a
   requirement — this is what TURN is *for*, and the existing coturn
   deployment already proves the team knows how to run this pattern on
   Fly.

None of these are blockers. All three are known, well-documented patterns
— but this is real infrastructure work, not a client-side library swap,
and it's the same category of work (a new self-hosted service, a new Fly
app or a second hosting provider, new secrets, new monitoring) as the
existing coturn deployment was.

## What this would actually replace and enable

| Today | With LiveKit |
|---|---|
| `CallScreen.tsx` — Jitsi iframe, no per-era skin possible | Custom call UI per era, built on raw tracks — **this is the missing piece for the parked call-window task** |
| `VoiceRoom.tsx` — Jitsi iframe, doesn't even use the app's own signaling | A real Discord-style voice channel, finally wired to the app's own auth/presence |
| `LivePage.tsx` — mesh, one encode per viewer, no real ceiling | SFU-backed broadcast: one upload from the broadcaster regardless of viewer count |
| `group_video` (declared in `themes.ts`, never implemented — see `skype-era-gaps.md` §1) | Actually implementable, since an SFU is what group video calling *is* |

That's four separate, previously-flagged gaps this one piece of
infrastructure would address at once — which is the strongest argument
for it, stronger than any throughput number.

## What it would cost

- A new self-hosted service to run, patch, and monitor (or a LiveKit
  Cloud subscription instead of self-hosting — exists, but trades the
  "no vendor lock-in, Apache 2.0, run it forever for free" property away
  for convenience; not evaluated in depth here since self-hosting is
  clearly the fit for a project that already runs its own TURN relay
  rather than paying for one)
- Real infra work to get UDP media traffic through Fly.io, per above —
  not large, but not zero, and it's the same shape of problem the coturn
  deployment already solved once
- Rewriting three client surfaces (`CallScreen.tsx`, `VoiceRoom.tsx`,
  `LivePage.tsx`) against LiveKit's React hooks instead of raw
  `RTCPeerConnection`/iframes — a real amount of code, done properly
  rather than as a quick swap, since the whole point is custom per-era UI
- `RemoteControl.tsx` (1:1 screen control + data channels) has no obvious
  reason to move — it's genuinely 1:1, an SFU buys it nothing, and its
  raw-WebRTC data-channel approach for file transfer/input events is
  simpler left as-is

## Recommendation

Worth doing, and it's the right foundation *specifically because* it's
also the answer to the already-parked "build a per-era call window" task
— that task was blocked on exactly the thing LiveKit provides (raw tracks
instead of someone else's iframe). Doing them as one piece of work rather
than two makes sense: there's no point building era-accurate call chrome
around Jitsi only to rip it out for LiveKit later.

The Fly/UDP question needs a decision before writing code, since it
determines whether this is "add a config file next to the existing
coturn app" or "stand up a box on a different host." Recommend option 1
above (narrow the port range, same pattern already proven) as the
starting point, since it keeps everything on the infrastructure already
in place.

Not started. This is the research; the call-window task (`skype-era-gaps.md`
§2) is where implementation would land if this goes ahead.
