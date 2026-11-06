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
`SLEEP_AFTER` (in `wrangler.jsonc`, default `30m`) stops it after that long
with no requests or socket traffic; the next visitor waits a few seconds
while the database restores. Nova and the scheduled sweepers don't run while
it sleeps. Set `SLEEP_AFTER` to e.g. `720h` to keep it effectively always on.

## One-time setup

1. **Workers Paid plan.** Dashboard > Workers & Pages > Plans. Containers
   don't run on the free plan.
2. **R2 token.** The bucket `phazechat-data` already exists. R2 > Manage API
   tokens > Create API token with *Object Read & Write* on that bucket. Keep
   its Access Key ID, Secret Access Key and the S3 endpoint
   (`https://<account-id>.r2.cloudflarestorage.com`).
3. **TURN key** (free up to 1,000 GB of relay traffic a month, no plan
   needed). Dashboard > Realtime > TURN Server > Create. Keep the Token ID
   and API token. The server uses them to hand out short-lived
   `turn.cloudflare.com` credentials, so there is no relay of our own to run.
4. **Worker secrets**, from `cloudflare/` (`npx wrangler secret put NAME`):

   | Secret | Value |
   | --- | --- |
   | `BUCKET_NAME` | `phazechat-data` |
   | `AWS_ENDPOINT_URL_S3` | the S3 endpoint from step 2 |
   | `AWS_ACCESS_KEY_ID` | from the R2 API token |
   | `AWS_SECRET_ACCESS_KEY` | from the R2 API token |
   | `PHAZE_CF_TURN_KEY_ID` | Token ID from step 3 |
   | `PHAZE_CF_TURN_API_TOKEN` | API token from step 3 |

   Then the app's own settings, as needed: `PHAZE_ALLOWED_ORIGINS`,
   `PHAZE_ADMIN_USERS`, `BREVO_API_KEY`, `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, `GEMINI_API_KEY`, `NOVA_PASSWORD`, `SENTRY_DSN`.
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
