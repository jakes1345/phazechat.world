#!/usr/bin/env bash
# Copies phazechat.world's live data off Fly.io into the R2 bucket the
# Cloudflare deploy uses. It runs in two halves so the Fly copy can be
# taken right away, before Cloudflare is ready:
#
#   fly auth login
#   ./cloudflare/seed-from-fly.sh backup              # Fly -> ./phaze-fly-backup
#
#   npx wrangler login
#   ./cloudflare/seed-from-fly.sh upload <r2-bucket>  # ./phaze-fly-backup -> R2
#
#   ./cloudflare/seed-from-fly.sh <r2-bucket>         # both, one after the other
#
# backup: downloads /data/nexus.db (and its -wal, which holds the newest
#   writes) and /data/uploads from the Fly app into ./phaze-fly-backup.
#   If the app's machine is stopped it is started first, because
#   `fly ssh` needs a running machine. That folder is a full backup: keep it.
# upload: puts the database in the bucket as seed/nexus.db (+ -wal) and
#   every upload under uploads/. On its first boot the container finds no
#   Litestream replica, imports the seed (cmd/fetch-seed checks it), and
#   starts replicating it. Run it before the Worker's R2 secrets are set,
#   so the first boot finds the seed.
#
# Avatars were stored outside the Fly volume and did not survive Fly
# deploys, so there are none to copy.
#
# Needs: flyctl for backup, Node (for npx wrangler) for upload, bash.
# Works on macOS, Linux and Windows under WSL or Git Bash.

set -euo pipefail

APP="${FLY_APP:-skype7-reborn}"
OUT="${OUT_DIR:-./phaze-fly-backup}"

usage() {
  cat >&2 <<USAGE
usage: $0 backup                 copy the live data off Fly into $OUT
       $0 upload <r2-bucket>     upload $OUT into the bucket
       $0 <r2-bucket>            both
(FLY_APP overrides the Fly app, default skype7-reborn; OUT_DIR the folder)
USAGE
  exit 2
}

ensure_running() {
  # fly ssh needs a running machine, and Fly stops idle or unpaid ones.
  # Starting a machine that is already running is a harmless no-op.
  local id
  for id in $(fly machine list -a "$APP" -q 2>/dev/null); do
    fly machine start "$id" -a "$APP" >/dev/null 2>&1 &&
      echo "    machine $id is running" ||
      echo "    could not start machine $id (continuing)"
  done
}

backup() {
  command -v fly >/dev/null || { echo "flyctl not found: https://fly.io/docs/flyctl/install/" >&2; exit 1; }
  if [ -e "$OUT" ]; then
    echo "$OUT already exists; move it aside first so an older backup is never mixed in." >&2
    exit 1
  fi
  mkdir -p "$OUT/uploads"

  ensure_running

  echo "==> Downloading the database from Fly app $APP"
  if ! fly ssh sftp get -a "$APP" /data/nexus.db "$OUT/nexus.db"; then
    echo "Could not reach the Fly machine. If Fly suspended the app over an unpaid bill," >&2
    echo "settle it (or ask Fly support for the volume) and run this again." >&2
    rm -rf "$OUT"
    exit 1
  fi
  # The WAL may not exist if the server checkpointed and closed cleanly.
  if fly ssh sftp get -a "$APP" /data/nexus.db-wal "$OUT/nexus.db-wal" 2>/dev/null; then
    echo "    got nexus.db-wal"
  else
    echo "    no nexus.db-wal on the server (fine)"
    rm -f "$OUT/nexus.db-wal"
  fi

  echo "==> Downloading uploads"
  if ! fly ssh sftp get -a "$APP" -R /data/uploads "$OUT/uploads"; then
    echo "    no /data/uploads on the server (fine if nobody uploaded files)"
  fi

  check_db
  echo "==> Backup complete in $OUT. Keep it."
}

check_db() {
  [ -f "$OUT/nexus.db" ] || { echo "No $OUT/nexus.db; run '$0 backup' first." >&2; exit 1; }
  head -c 16 "$OUT/nexus.db" | grep -q "SQLite format 3" || {
    echo "$OUT/nexus.db is not a SQLite database; stopping before anything is uploaded." >&2
    exit 1
  }
}

upload() {
  local bucket="$1"
  command -v npx >/dev/null || { echo "npx not found: install Node.js" >&2; exit 1; }
  check_db

  put() { # put <local file> <bucket key>
    npx --yes wrangler@4.156.0 r2 object put "$bucket/$2" --file "$1" --remote >/dev/null
  }

  echo "==> Uploading the database to r2://$bucket/seed/"
  put "$OUT/nexus.db" seed/nexus.db
  if [ -f "$OUT/nexus.db-wal" ]; then put "$OUT/nexus.db-wal" seed/nexus.db-wal; fi

  local count=0 f
  # sftp -R may nest the folder (uploads/uploads/...); upload files by name,
  # which is how the server addresses them.
  while IFS= read -r -d '' f; do
    put "$f" "uploads/$(basename "$f")"
    count=$((count + 1))
    if [ $((count % 25)) -eq 0 ]; then echo "    $count files"; fi
  done < <(find "$OUT/uploads" -type f -print0 2>/dev/null)
  echo "==> Uploaded the database and $count upload(s)."
  echo "    Backup kept in $OUT. Deploy (or restart) the Cloudflare container to import it."
}

case "${1:-}" in
  "") usage ;;
  backup) [ $# -eq 1 ] || usage; backup ;;
  upload) [ $# -eq 2 ] || usage; upload "$2" ;;
  -h|--help) usage ;;
  *) [ $# -eq 1 ] || usage; backup; upload "$1" ;;
esac
