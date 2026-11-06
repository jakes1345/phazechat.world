#!/bin/sh
# Phaze Nexus entrypoint.
#
# If a bucket is configured (BUCKET_NAME, or LITESTREAM_BUCKET), restore the
# SQLite DB from it (no-op if the bucket has no replica yet, e.g. first boot)
# and then run the server under `litestream replicate` so every WAL frame
# streams to the bucket.
#
# With no bucket, run the server directly. This keeps local / self-hosted
# deployments simple: no S3 dependency until you opt in.
#
# PHAZE_EPHEMERAL_DISK=1 (set by the Cloudflare Worker) means the disk is
# empty on every start, so the bucket is the only copy of the data:
#   - a bucket is required,
#   - a failed restore stops the boot instead of starting on an empty DB,
#   - with no replica yet, a one-time seed (seed/nexus.db, uploaded by
#     cloudflare/seed-from-fly.sh) is imported before replication starts.

set -eu

DB_PATH="${DB_PATH:-/data/nexus.db}"
BUCKET="${BUCKET_NAME:-${LITESTREAM_BUCKET:-}}"
EPHEMERAL="${PHAZE_EPHEMERAL_DISK:-}"

start_nova() {
  if [ -n "${NOVA_PASSWORD:-}" ] && [ -n "${GEMINI_API_KEY:-}" ]; then
    echo "[entrypoint] starting Nova bot (5s delay for Nexus boot)"
    sleep 5 && /app/nova-bot &
  else
    echo "[entrypoint] Nova bot disabled (NOVA_PASSWORD or GEMINI_API_KEY not set)"
  fi
}

if [ -n "$EPHEMERAL" ] && [ -z "$BUCKET" ]; then
  echo "[entrypoint] PHAZE_EPHEMERAL_DISK is set but no bucket is configured; refusing to start on a disk that will be wiped"
  exit 1
fi

if [ -n "$BUCKET" ]; then
  export BUCKET_NAME="$BUCKET"
  mkdir -p "$(dirname "$DB_PATH")"
  echo "[entrypoint] litestream: restoring ${DB_PATH} from s3://${BUCKET}"
  if ! litestream restore -if-replica-exists -config /app/litestream.yml "${DB_PATH}"; then
    if [ -n "$EPHEMERAL" ]; then
      echo "[entrypoint] restore failed; not starting on an empty database"
      exit 1
    fi
    echo "[entrypoint] restore failed; continuing with on-disk DB"
  fi
  if [ -n "$EPHEMERAL" ] && [ ! -f "$DB_PATH" ]; then
    /app/fetch-seed -db "$DB_PATH"
  fi
  echo "[entrypoint] litestream: replicating ${DB_PATH} -> s3://${BUCKET}"
  start_nova
  exec litestream replicate -config /app/litestream.yml -exec "/app/nexus-server"
fi

echo "[entrypoint] litestream disabled (no BUCKET_NAME/LITESTREAM_BUCKET); running without replication"
start_nova
exec /app/nexus-server
