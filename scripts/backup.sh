#!/usr/bin/env bash
set -euo pipefail

# scripts/backup.sh - Dumps PostgreSQL database to compressed archive (TASK-085).
# Usage: ./scripts/backup.sh [output-file]

BACKUP_DIR="${BACKUP_DIR:-backups}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date -u +"%Y%m%d_%H%M%SZ")
OUTPUT_FILE="${1:-${BACKUP_DIR}/shopscale_${TIMESTAMP}.dump}"

DATABASE_URL="${DATABASE_URL:-postgresql://shopscale:shopscale@127.0.0.1:5432/shopscale}"

echo "Starting ShopScale database backup..."
echo "Target output: $OUTPUT_FILE"

# Use pg_dump custom format (-Fc) with maximum compression (-Z 9)
if command -v pg_dump >/dev/null 2>&1; then
  pg_dump --dbname="$DATABASE_URL" --format=c --compress=9 --file="$OUTPUT_FILE"
elif command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -q 'postgres'; then
  CONTAINER="$(docker ps --format '{{.Names}}' | grep -m1 'postgres')"
  docker exec -i "$CONTAINER" pg_dump -U shopscale -d shopscale -Fc -Z 9 > "$OUTPUT_FILE"
else
  echo "Error: Neither pg_dump nor active docker postgres container found." >&2
  exit 1
fi

chmod 600 "$OUTPUT_FILE" 2>/dev/null || true
echo "Backup successfully created: $OUTPUT_FILE"
