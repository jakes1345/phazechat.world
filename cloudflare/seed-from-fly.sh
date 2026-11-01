#!/usr/bin/env bash
# Copies phazechat.world's live data off Fly.io into the R2 bucket the
# Cloudflare deploy uses. Run it once, before the first Cloudflare deploy
# serves traffic, from a machine signed in to both:
#
#   fly auth login
#   npx wrangler login
#   ./cloudflare/seed-from-fly.sh <r2-bucket-name>
#
# What it does:
#   1. Downloads /data/nexus.db (and its -wal, which holds the newest
#      writes) and /data/uploads from the Fly app into ./phaze-fly-backup.
#      That folder is a full backup: keep it.
#   2. Uploads the database to the bucket as seed/nexus.db (+ -wal). On
#      its first boot the container finds no Litestream replica, imports
#      the seed (cmd/fetch-seed checks it), and starts replicating it.
#   3. Uploads every file in uploads/ to the bucket under uploads/, where
#      the server now reads them.
#
# Avatars were stored outside the Fly volume and did not survive Fly
# deploys, so there are none to copy.
#
# Needs: flyctl, Node (for npx wrangler), bash. Works on macOS, Linux and
# Windows under WSL or Git Bash.

set -euo pipefail

BUCKET="${1:-}"
APP="${FLY_APP:-skype7-reborn}"
OUT="${OUT_DIR:-./phaze-fly-backup}"

if [ -z "$BUCKET" ]; then
  echo "usage: $0 <r2-bucket-name>   (set FLY_APP to override the Fly app, default skype7-reborn)" >&2
  exit 2
fi
command -v fly >/dev/null || { echo "flyctl not found: https://fly.io/docs/flyctl/install/" >&2; exit 1; }
command -v npx >/dev/null || { echo "npx not found: install Node.js" >&2; exit 1; }

if [ -e "$OUT" ]; then
  echo "$OUT already exists; move it aside first so an older backup is never mixed in." >&2
  exit 1
fi
mkdir -p "$OUT/uploads"

echo "==> Downloading the database from Fly app $APP"
fly ssh sftp get -a "$APP" /data/nexus.db "$OUT/nexus.db"
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

head -c 16 "$OUT/nexus.db" | grep -q "SQLite format 3" || {
  echo "Downloaded nexus.db is not a SQLite database; stopping before anything is uploaded." >&2
  exit 1
}

put() { # put <local file> <bucket key>
  npx --yes wrangler@4.156.0 r2 object put "$BUCKET/$2" --file "$1" --remote >/dev/null
}

echo "==> Uploading the database to r2://$BUCKET/seed/"
put "$OUT/nexus.db" seed/nexus.db
[ -f "$OUT/nexus.db-wal" ] && put "$OUT/nexus.db-wal" seed/nexus.db-wal

count=0
# sftp -R may nest the folder (uploads/uploads/...); upload files by name,
# which is how the server addresses them.
while IFS= read -r -d '' f; do
  put "$f" "uploads/$(basename "$f")"
  count=$((count + 1))
  if [ $((count % 25)) -eq 0 ]; then echo "    $count files"; fi
done < <(find "$OUT/uploads" -type f -print0)
echo "==> Uploaded the database and $count upload(s)."
echo "    Backup kept in $OUT. Deploy (or restart) the Cloudflare container to import it."
