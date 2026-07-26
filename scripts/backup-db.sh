#!/usr/bin/env bash
# =============================================================================
#  Nightly Postgres backup -> MinIO (self-hosted, same box).
# -----------------------------------------------------------------------------
#  Backs up ONLY the `unknown` database. The other stacks on this VPS (seema,
#  n8n) own their own data and are never touched.
#
#  Installed by scripts/install-backup-cron.sh; runs from cron at 03:20 daily.
#  Manual run:  bash /opt/unknown/scripts/backup-db.sh
#
#  Retention: 14 days. Old dumps are pruned from the bucket after each run.
# =============================================================================
set -euo pipefail

INFRA=/opt/unknown/infra
LOG=/var/log/unknown-backup.log
RETENTION_DAYS=14
BUCKET=unknown-backups

exec >>"$LOG" 2>&1
echo "----- $(date -Is) backup start -----"

set -a
# shellcheck disable=SC1091
. "$INFRA/.env"
set +a

STAMP=$(date +%F-%H%M%S)
DUMP="/tmp/unknown-${STAMP}.sql.gz"

# --- 1. dump -------------------------------------------------------------
# Piped straight through gzip so the uncompressed dump never hits disk.
docker exec unknown-postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  | gzip -9 > "$DUMP"

SIZE=$(stat -c%s "$DUMP")
if [ "$SIZE" -lt 1000 ]; then
  echo "ERROR: dump is only ${SIZE} bytes — refusing to upload a broken backup"
  rm -f "$DUMP"
  exit 1
fi
echo "dumped ${SIZE} bytes -> $(basename "$DUMP")"

# --- 2. upload to MinIO --------------------------------------------------
# The mc client runs as a throwaway container on the same network, so no extra
# software is installed on the host.
docker run --rm --network unknown-net \
  -v "$DUMP:/backup/$(basename "$DUMP"):ro" \
  --entrypoint sh minio/mc:latest -c "
    mc alias set store http://unknown-minio:9000 '$S3_ACCESS_KEY_ID' '$S3_SECRET_ACCESS_KEY' >/dev/null &&
    mc mb --ignore-existing store/$BUCKET >/dev/null &&
    mc cp /backup/$(basename "$DUMP") store/$BUCKET/ >/dev/null &&
    echo uploaded &&
    mc ls store/$BUCKET | tail -3
  "

rm -f "$DUMP"

# --- 3. prune anything older than the retention window -------------------
docker run --rm --network unknown-net \
  --entrypoint sh minio/mc:latest -c "
    mc alias set store http://unknown-minio:9000 '$S3_ACCESS_KEY_ID' '$S3_SECRET_ACCESS_KEY' >/dev/null &&
    mc rm --recursive --force --older-than ${RETENTION_DAYS}d store/$BUCKET/ 2>/dev/null || true
  "

echo "backup OK (retention ${RETENTION_DAYS}d)"
echo "----- $(date -Is) backup end -----"
