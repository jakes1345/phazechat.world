# Phaze on Cloudflare Containers

phazechat.world runs as one Cloudflare Container: the same image as
`nexus_server/Dockerfile`, fronted by a small Worker (`src/index.ts`).

```
visitor ──> Worker (sets X-Phaze-Client-IP) ──> PhazeNexus container (one instance)
                                                   │  SQLite on local disk
                                                   ├─ Litestream ──────────┐
                                                   └─ uploads, avatars ────┤ http://r2.phaze
                                                                           ▼
                                        Worker outbound handler (src/s3.ts) ──> R2 binding BUCKET
```

The container never talks to R2's S3 API. Its S3 clients (Litestream and
minio-go) send path-style requests to `http://r2.phaze`; the Containers
runtime routes that hostname to the Worker's outbound handler on the same
machine, which answers them from the `BUCKET` R2 binding. So there is no R2
API token to create, store or rotate: the clients sign with placeholder keys
and the handler ignores the signatures, since only this container can reach
it.

The container's disk is wiped whenever it sleeps or is redeployed, so R2 is
where the data lives:

- The database is restored from R2 by Litestream at every start and every
  write streams back within a second.
- Chat uploads and avatars are stored straight in R2
  (`PHAZE_BLOB_STORE=s3`, see `nexus_server/blobstore.go`).
- If the `BUCKET` binding is missing the Worker answers 503 instead of starting the
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
`SLEEP_AFTER` (in `wrangler.jsonc`, default `30m`) stops it after that long
with no requests or socket traffic; the next visitor waits a few seconds
while the database restores. Nova and the scheduled sweepers don't run while
it sleeps. Set `SLEEP_AFTER` to e.g. `720h` to keep it effectively always on.

## One-time setup

1. **Workers Paid plan.** Dashboard > Workers & Pages > Plans. Containers
   don't run on the free plan.
2. **R2 bucket.** `phazechat-data` already exists and is bound to the
   Worker in `wrangler.jsonc`. Nothing else to set up for storage.
3. **TURN key** (free up to 1,000 GB of relay traffic a month, no plan
   needed). Dashboard > Realtime > TURN Server > Create. Keep the Token ID
   and API token. The server uses them to hand out short-lived
   `turn.cloudflare.com` credentials, so there is no relay of our own to run.
4. **Worker secrets**, from `cloudflare/` (`npx wrangler secret put NAME`):

   | Secret | Value |
   | --- | --- |
   | `PHAZE_CF_TURN_KEY_ID` | Token ID from step 3 |
   | `PHAZE_CF_TURN_API_TOKEN` | API token from step 3 |

   `BUCKET_NAME` and the `AWS_*` settings are set by the Worker itself;
   secrets with those names are ignored and can be deleted.

   Then the app's own settings, as needed: `PHAZE_ALLOWED_ORIGINS`,
   `PHAZE_ADMIN_USERS`, `BREVO_API_KEY`, `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, `GEMINI_API_KEY`, `NOVA_PASSWORD`, `SENTRY_DSN`,
   and `PHAZE_GOOGLE_CLIENT_ID` / `PHAZE_GOOGLE_CLIENT_SECRET` for Sign in
   with Google (see `docs/google-sign-in.md`).
   Every string secret is passed to the server as an environment variable.
   Don't set `PHAZE_TRUST_PROXY_HEADER`; the Worker sets it.
5. **GitHub secrets** (repo Settings > Secrets and variables > Actions):
   `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN` made from the
   *Edit Cloudflare Workers* template under Account API tokens. The deploy
   also pushes the container image, so if the template's list doesn't
   already have it, add *Account > Containers > Edit* before saving. Then run
   the *Deploy to Cloudflare* workflow (Actions tab > Run workflow), or push
   to `master`.
6. **Domain.** Once the deploy is green and the `*.workers.dev` URL works:
   Workers & Pages > phazechat > Settings > Domains & Routes > Add >
   Custom domain > `phazechat.world` (the zone is already on this
   Cloudflare account).

The first start creates a new, empty database. To start from an existing
one instead, upload it to the bucket as `seed/nexus.db` (and
`seed/nexus.db-wal` if it has one) before the first deploy:

```
npx wrangler r2 object put phazechat-data/seed/nexus.db --file ./nexus.db --remote
```

The container imports it once, on a start that finds no database in R2.
Uploads that belong to it go under `uploads/` and avatars under `avatars/`
with the same file names they had on disk.

## Day to day

- Logs: Workers & Pages > phazechat > Logs, or `npx wrangler tail`.
- New app setting: `npx wrangler secret put NAME`; it reaches the server on
  the container's next start.
- Restore drill: the database replica is under `nexus.db/` in the bucket.
  To pull a copy from your own machine, make a read-only R2 API token, set
  `BUCKET_NAME`, `AWS_ENDPOINT_URL_S3`
  (`https://<account-id>.r2.cloudflarestorage.com`), `AWS_REGION=auto` and
  the token's key pair, then run `litestream restore -config
  nexus_server/litestream.yml -o ./copy.db /data/nexus.db`.

## Development

```
cd cloudflare
npm ci
npm run typecheck
npm test
```
