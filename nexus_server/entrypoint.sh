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
#
# Process model: this script stays PID 1. It runs the server (under
# Litestream when a bucket is set) and, when configured, the Nova bot in a
# restart loop with backoff. SIGTERM/SIGINT are forwarded to both; Litestream
# passes the signal on to the server and does a final sync before exiting.
# When the server exits, Nova is stopped and the container exits with the
# server's status. A crashing Nova never takes the server down.

set -eu

DB_PATH="${DB_PATH:-/data/nexus.db}"
BUCKET="${BUCKET_NAME:-${LITESTREAM_BUCKET:-}}"
EPHEMERAL="${PHAZE_EPHEMERAL_DISK:-}"

log() { echo "[entrypoint] $*"; }

# --- Nova supervisor ---------------------------------------------------------
# Runs in a background subshell. Restarts nova-bot whenever it exits, waiting
# 5s, 10s, 20s ... up to 5 minutes between attempts; the delay resets once a
# run has lasted at least a minute. Exits when sent SIGTERM/SIGINT.
nova_supervisor() {
  stop=0
  child=""
  trap 'stop=1; if [ -n "$child" ]; then kill -TERM "$child" 2>/dev/null || true; fi' TERM INT
  backoff=5
  # Give the server a head start; `sleep & wait` so a signal interrupts it.
  sleep 5 & child=$!
  wait "$child" 2>/dev/null || true
  child=""
  while [ "$stop" = 0 ]; do
    started=$(date +%s)
    /app/nova-bot & child=$!
    rc=0
    wait "$child" || rc=$?
    if [ "$stop" = 1 ]; then
      wait "$child" 2>/dev/null || true
      break
    fi
    child=""
    if [ $(( $(date +%s) - started )) -ge 60 ]; then
      backoff=5
    fi
    log "Nova bot exited with status $rc; restarting in ${backoff}s"
    sleep "$backoff" & child=$!
    wait "$child" 2>/dev/null || true
    child=""
    backoff=$(( backoff * 2 ))
    if [ "$backoff" -gt 300 ]; then backoff=300; fi
  done
  log "Nova bot stopped"
}

NOVA_PID=""
start_nova() {
  if [ -n "${NOVA_PASSWORD:-}" ] && [ -n "${GEMINI_API_KEY:-}" ]; then
    log "starting Nova bot (supervised; 5s delay for Nexus boot)"
    nova_supervisor &
    NOVA_PID=$!
  else
    log "Nova bot disabled (NOVA_PASSWORD or GEMINI_API_KEY not set)"
  fi
}

# --- Preflight ---------------------------------------------------------------
if [ -n "$EPHEMERAL" ] && [ -z "$BUCKET" ]; then
  log "PHAZE_EPHEMERAL_DISK is set but no bucket is configured; refusing to start on a disk that will be wiped"
  exit 1
fi

DATA_DIR="$(dirname "$DB_PATH")"
mkdir -p "$DATA_DIR" 2>/dev/null || true
if ! ( : > "$DATA_DIR/.phaze-write-test" ) 2>/dev/null; then
  log "$DATA_DIR is not writable by uid $(id -u). The image runs as uid 10001;"
  log "a volume created by an older (root) image needs a one-time ownership fix, e.g.:"
  log "  docker run --rm -u 0 -v <volume>:/data --entrypoint chown <image> -R 10001:10001 /data"
  exit 1
fi
rm -f "$DATA_DIR/.phaze-write-test"
if [ -n "${PHAZE_UPLOAD_DIR:-}" ]; then
  mkdir -p "$PHAZE_UPLOAD_DIR" 2>/dev/null || true
fi

# --- Restore + start ---------------------------------------------------------
if [ -n "$BUCKET" ]; then
  export BUCKET_NAME="$BUCKET"
  log "litestream: restoring ${DB_PATH} from s3://${BUCKET}"
  if ! litestream restore -if-replica-exists -config /app/litestream.yml "${DB_PATH}"; then
    if [ -n "$EPHEMERAL" ]; then
      log "restore failed; not starting on an empty database"
      exit 1
    fi
    log "restore failed; continuing with on-disk DB"
  fi
  if [ -n "$EPHEMERAL" ] && [ ! -f "$DB_PATH" ]; then
    /app/fetch-seed -db "$DB_PATH"
  fi
  log "litestream: replicating ${DB_PATH} -> s3://${BUCKET}"
  litestream replicate -config /app/litestream.yml -exec "/app/nexus-server" &
  MAIN_PID=$!
else
  log "litestream disabled (no BUCKET_NAME/LITESTREAM_BUCKET); running without replication"
  /app/nexus-server &
  MAIN_PID=$!
fi

# shellcheck disable=SC2317  # invoked from the traps below
forward() {
  log "received $1; shutting down"
  kill -TERM "$MAIN_PID" 2>/dev/null || true
  if [ -n "$NOVA_PID" ]; then kill -TERM "$NOVA_PID" 2>/dev/null || true; fi
}
trap 'forward SIGTERM' TERM
trap 'forward SIGINT' INT

start_nova

# `wait` returns early when a trapped signal arrives; keep waiting until the
# server process is really gone so we exit with its status.
while :; do
  rc=0
  wait "$MAIN_PID" || rc=$?
  if ! kill -0 "$MAIN_PID" 2>/dev/null; then break; fi
done
log "server exited with status $rc"

if [ -n "$NOVA_PID" ]; then
  kill -TERM "$NOVA_PID" 2>/dev/null || true
  wait "$NOVA_PID" 2>/dev/null || true
fi
exit "$rc"
