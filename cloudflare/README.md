# Phaze on Cloudflare Containers

phazechat.world runs as one Cloudflare Container: the same image as
`nexus_server/Dockerfile`, fronted by a small Worker (`src/index.ts`).

```
visitor ──> Worker (sets X-Phaze-Client-IP) ──> PhazeNexus container (one instance)
                                                   │  SQLite on local disk
                                                   ├─ Litestream ──> R2  nexus.db/…
                                                   └─ uploads, avatars ──> R2  uploads/…, avatars/…
```

The container's disk is wiped whenever it sleeps or is redeployed, so R2 is
where the data lives:

- The database is restored from R2 by Litestream at every start and every
  write streams back within a second.
- Chat uploads and avatars are stored straight in R2
  (`PHAZE_BLOB_STORE=s3`, see `nexus_server/blobstore.go`).
- If R2 is not configured the Worker answers 503 instead of starting the
  server on an empty disk, and the entrypoint refuses to start if the
  database restore fails.

There is only ever one instance (`max_instances: 1`), because SQLite has a
single writer. A deploy stops the running instance and the next request
starts the new image, restoring the database first.

## Cost

Containers need the Workers Paid plan ($5/month). The `basic` instance is
1/4 vCPU and 1 GiB. Memory is billed while the container is running, beyond
25 GiB-hours a month, at $0.0000025 per GiB-second, so an instance that never
sleeps adds about $6 to $7 a month in memory plus a little disk and CPU.
`SLEEP_AFTER` (in `wrangler.jsonc`) is set to `720h`, so the container
stays up and visitors never hit a cold start. Set it to e.g. `30m` to let it
sleep when idle and save the memory cost; the next visitor then waits a few
seconds while the database restores, and Nova and the scheduled sweepers
don't run while it sleeps.

## One-time setup

> **Back up the Fly data first, today.** The Fly account has an overdue
> invoice and Fly can suspend it, taking the machine and its volume (the
> only copy of the database and uploads) with it. Step 3's
> `./cloudflare/seed-from-fly.sh backup` needs nothing from Cloudflare, so
> run it before anything else and keep `./phaze-fly-backup` somewhere safe.

Order matters in steps 3 and 4: the data import only runs when the bucket
has no database yet, and the container won't start until step 4 is done.

1. **Workers Paid plan.** Dashboard > Workers & Pages > Plans.
2. **R2 bucket.** Dashboard > R2 > Create bucket, e.g. `phaze-data`.
   Then R2 > Manage API tokens > Create API token with *Object Read & Write*
   on that bucket. Keep its Access Key ID, Secret Access Key and the S3
   endpoint (`https://<account-id>.r2.cloudflarestorage.com`).
3. **Copy the data off Fly** (before step 4). The Fly half can run any
   time, even before steps 1 and 2, so take it as early as you can:

   ```
   fly auth login
   ./cloudflare/seed-from-fly.sh backup
   ```

   It starts the Fly machine if Fly stopped it and downloads the database
   and uploads into `./phaze-fly-backup`. Keep that folder: it is a full
   backup. Once the bucket exists, put the backup in it:

   ```
   npx wrangler login
   ./cloudflare/seed-from-fly.sh upload phaze-data
   ```

   The container imports the database on its first start.
4. **Worker secrets**, from `cloudflare/` (`npx wrangler secret put NAME`):

   | Secret | Value |
   | --- | --- |
   | `BUCKET_NAME` | the bucket name |
   | `AWS_ENDPOINT_URL_S3` | the S3 endpoint from step 2 |
   | `AWS_ACCESS_KEY_ID` | from the R2 API token |
   | `AWS_SECRET_ACCESS_KEY` | from the R2 API token |

   Then every app secret that was set on Fly (`fly secrets list -a
   skype7-reborn` shows the names), for example `BREVO_API_KEY`,
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `PHAZE_ADMIN_USERS`,
   `GEMINI_API_KEY`, `NOVA_PASSWORD`, `SENTRY_DSN`, and the TURN settings
   (see [Calls (TURN)](#calls-turn)). Every string secret is passed to the
   server as an environment variable. Don't copy Fly's `BUCKET_NAME` or
   `AWS_*` (those were Tigris) or `PHAZE_TRUST_PROXY_HEADER` (the Worker
   sets it).

   Also set `Phaze_ALLOWED_ORIGINS` (the name is case-sensitive) to
   `https://phazechat.world,https://www.phazechat.world`. Without it the
   server accepts WebSocket and CORS requests from any origin.
5. **GitHub secrets** (repo Settings > Secrets and variables > Actions):
   `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN` made from the
   *Edit Cloudflare Workers* template under Account API tokens. Then run
   the *Deploy to Cloudflare* workflow (Actions tab > Run workflow, on
   `master`). After that it deploys by itself whenever *Phaze CI* passes
   on a push to `master`, using the exact commit CI tested.
6. **Domain.** Once the deploy is green and the `*.workers.dev` URL works:
   Workers & Pages > phazechat > Settings > Domains & Routes > Add >
   Custom domain, once for `phazechat.world` and once for
   `www.phazechat.world` (the zone must be on this Cloudflare account, and
   any old A/AAAA/CNAME records for those names pointing at Fly have to go
   first). That moves the site off Fly; then the Fly app can be shut down.

## Cutover checklist

- [ ] Fly data backed up (`seed-from-fly.sh backup`); the Fly account is
      overdue and may be suspended at any time, so this comes first.
- [ ] Workers Paid plan, R2 bucket and R2 API token (steps 1-2).
- [ ] Backup uploaded to the bucket (`seed-from-fly.sh upload`) before the
      first container start.
- [ ] Worker secrets: storage (`BUCKET_NAME`, `AWS_ENDPOINT_URL_S3`,
      `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) and the app secrets
      copied from Fly.
- [ ] `Phaze_ALLOWED_ORIGINS=https://phazechat.world,https://www.phazechat.world`.
      The desktop app sends its embedded page's origin; if desktop users
      can't connect after this, add that origin too (Wails uses
      `http://wails.localhost` on Windows and `wails://wails` on Linux).
- [ ] TURN decided and configured (see [Calls (TURN)](#calls-turn)): if
      it was the `phaze-turn` Fly app, it goes down with the Fly account.
- [ ] GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`;
      first deploy green; the `*.workers.dev` URL shows the site and you
      can log in with an existing account (proves the import worked).
- [ ] Custom domains for **both** `phazechat.world` and
      `www.phazechat.world`.
- [ ] After a day of normal traffic: check `nexus.db/` keeps growing in
      R2, then shut down the Fly apps.

## Calls (TURN)

Cloudflare Containers only receive HTTP(S)/WebSocket traffic through the
Worker. TURN needs raw UDP (and TCP 3478/5349) on a public IP, so it
cannot run in this container and has to stay a separate service.

How the server hands out TURN credentials (`generateMediaToken` in
`nexus_server/main.go`):

- `PHAZE_TURN_URL` + `PHAZE_TURN_USERNAME` + `PHAZE_TURN_PASSWORD`: one
  fixed username/password given to every client (for providers that issue
  long-lived static credentials).
- `PHAZE_TURN_URL` + `PHAZE_TURN_SECRET`: coturn-style time-limited
  credentials (HMAC of `<expiry>:<username>`, 24h, or 10 min with
  `PHAZE_TURN_SHORT_TERM=true`).

Cloudflare's own TURN service (Realtime TURN) doesn't fit either mode: its
credentials are short-lived and have to be minted per session by calling
the Cloudflare API with a TURN key, and the server has no code for that.
Pasting one generated credential into `PHAZE_TURN_USERNAME`/`PASSWORD`
would work only until it expires. Until the server learns to mint them,
use one of:

1. **coturn on a small VPS (recommended).** Any VPS with a public IPv4 and
   UDP open. Use `scripts/phaze_turnserver.conf` (set `static-auth-secret`
   to `openssl rand -hex 32`, set `realm`, open 3478/udp+tcp, 5349/tcp and
   the relay port range), or run the `infra/coturn` image with
   `TURN_SECRET`, `TURN_REALM` and `PUBLIC_IP`. Then set Worker secrets
   `PHAZE_TURN_URL=turn:<vps-host>:3478` and `PHAZE_TURN_SECRET=<same
   secret>`.
2. **A TURN provider with static credentials** (e.g. Metered, Xirsys):
   set `PHAZE_TURN_URL` (comma-separated for several URLs),
   `PHAZE_TURN_USERNAME` and `PHAZE_TURN_PASSWORD`.

`infra/coturn/fly.toml` (the `phaze-turn` Fly app) is only an option while
the Fly account is in good standing.

## Day to day

- Logs: Workers & Pages > phazechat > Logs, or `npx wrangler tail`.
- New app setting: `npx wrangler secret put NAME`; it reaches the server on
  the container's next start.
- Restore drill: the database replica is under `nexus.db/` in the bucket;
  `litestream restore -config nexus_server/litestream.yml -o ./copy.db
  /data/nexus.db` with the same environment variables pulls a copy.

## Development

```
cd cloudflare
npm ci
npm run typecheck
npm test
```
