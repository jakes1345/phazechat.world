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

Order matters in steps 3 and 4: the data import only runs when the bucket
has no database yet, and the container won't start until step 4 is done.

1. **Workers Paid plan.** Dashboard > Workers & Pages > Plans.
2. **R2 bucket.** Dashboard > R2 > Create bucket, e.g. `phaze-data`.
   Then R2 > Manage API tokens > Create API token with *Object Read & Write*
   on that bucket. Keep its Access Key ID, Secret Access Key and the S3
   endpoint (`https://<account-id>.r2.cloudflarestorage.com`).
3. **Copy the data off Fly** (before step 4), from a machine signed in with
   `fly auth login` and `npx wrangler login`:

   ```
   ./cloudflare/seed-from-fly.sh phaze-data
   ```

   It downloads the database and uploads into `./phaze-fly-backup` (keep it)
   and puts them in the bucket. The container imports the database on its
   first start.
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
   `PHAZE_TURN_URL`/`PHAZE_TURN_SECRET`, `GEMINI_API_KEY`, `NOVA_PASSWORD`,
   `SENTRY_DSN`. Every string secret is passed to the server as an
   environment variable. Don't copy Fly's `BUCKET_NAME` or `AWS_*` (those
   were Tigris) or `PHAZE_TRUST_PROXY_HEADER` (the Worker sets it).
5. **GitHub secrets** (repo Settings > Secrets and variables > Actions):
   `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN` made from the
   *Edit Cloudflare Workers* template under Account API tokens. Then run
   the *Deploy to Cloudflare* workflow (Actions tab > Run workflow), or push
   to `master`.
6. **Domain.** Once the deploy is green and the `*.workers.dev` URL works:
   Workers & Pages > phazechat > Settings > Domains & Routes > Add >
   Custom domain > `phazechat.world` (the zone must be on this Cloudflare
   account). That moves the site off Fly; then the Fly app can be shut down.

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
