#!/usr/bin/env bash
set -euo pipefail

# scripts/restore.sh - Restores PostgreSQL database from compressed archive (TASK-085).
# Usage: ./scripts/restore.sh <archive-path>

ARCHIVE_PATH="${1:-}"
if [ -z "$ARCHIVE_PATH" ] || [ ! -f "$ARCHIVE_PATH" ]; then
  echo "Usage: ./scripts/restore.sh <archive-path>" >&2
  exit 1
fi

DATABASE_URL="${DATABASE_URL:-postgresql://shopscale:shopscale@127.0.0.1:5432/shopscale}"

echo "Starting ShopScale database restoration from: $ARCHIVE_PATH"

if command -v pg_restore >/dev/null 2>&1; then
  # Terminate active sessions and restore cleanly
  pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$ARCHIVE_PATH"
elif command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -q 'postgres'; then
  CONTAINER="$(docker ps --format '{{.Names}}' | grep -m1 'postgres')"
  docker exec -i "$CONTAINER" pg_restore -U shopscale -d shopscale --clean --if-exists --no-owner < "$ARCHIVE_PATH"
else
  echo "Error: Neither pg_restore nor active docker postgres container found." >&2
  exit 1
fi

echo "Database restored successfully."
