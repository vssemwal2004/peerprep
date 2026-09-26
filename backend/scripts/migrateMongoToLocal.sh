#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

require_command mongodump
require_command mongorestore
require_command mongosh

: "${SOURCE_MONGODB_URI:?Set SOURCE_MONGODB_URI to the current Atlas URI}"
: "${TARGET_MONGODB_URI:?Set TARGET_MONGODB_URI to the new local MongoDB admin URI}"

DATABASE_NAME="${DATABASE_NAME:-peerprep}"
MIGRATION_BACKUP_DIR="${MIGRATION_BACKUP_DIR:-/var/backups/peerprep-migration}"
CONFIRM_TARGET_REPLACE="${CONFIRM_TARGET_REPLACE:-NO}"

if [[ ! "$DATABASE_NAME" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "DATABASE_NAME contains unsupported characters." >&2
  exit 1
fi

if [[ "$SOURCE_MONGODB_URI" == "$TARGET_MONGODB_URI" ]]; then
  echo "Source and target MongoDB URIs must be different." >&2
  exit 1
fi

if [[ "$TARGET_MONGODB_URI" != *"127.0.0.1"* && "$TARGET_MONGODB_URI" != *"localhost"* ]]; then
  if [[ "${ALLOW_REMOTE_TARGET:-NO}" != "YES" ]]; then
    echo "Target is not local. Set ALLOW_REMOTE_TARGET=YES only after verifying the target URI." >&2
    exit 1
  fi
fi

if [[ "$CONFIRM_TARGET_REPLACE" != "YES" ]]; then
  echo "Migration stopped before making changes."
  echo "The restore uses --drop and replaces collections in ${DATABASE_NAME}."
  echo "After verifying both URIs, set CONFIRM_TARGET_REPLACE=YES and run again."
  exit 1
fi

mkdir -p "$MIGRATION_BACKUP_DIR"
MIGRATION_TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
MIGRATION_ARCHIVE="${MIGRATION_BACKUP_DIR}/${DATABASE_NAME}-${MIGRATION_TIMESTAMP}.archive.gz"
SOURCE_COUNTS="${MIGRATION_BACKUP_DIR}/${DATABASE_NAME}-${MIGRATION_TIMESTAMP}.source-counts.json"
TARGET_COUNTS="${MIGRATION_BACKUP_DIR}/${DATABASE_NAME}-${MIGRATION_TIMESTAMP}.target-counts.json"

collection_counts() {
  local uri="$1"
  mongosh "$uri" --quiet --eval "
    const targetDb = db.getSiblingDB('${DATABASE_NAME}');
    const names = targetDb.getCollectionNames().filter((name) => !name.startsWith('system.')).sort();
    print(JSON.stringify(Object.fromEntries(names.map((name) => [name, targetDb.getCollection(name).countDocuments({})]))));
  "
}

echo "Recording source collection counts..."
collection_counts "$SOURCE_MONGODB_URI" > "$SOURCE_COUNTS"
if grep -Eq '^\{\}[[:space:]]*$' "$SOURCE_COUNTS" && [[ "${ALLOW_EMPTY_SOURCE:-NO}" != "YES" ]]; then
  echo "The source database has no user collections. Verify DATABASE_NAME before continuing." >&2
  echo "Set ALLOW_EMPTY_SOURCE=YES only if an empty source is intentional." >&2
  exit 1
fi

echo "Creating compressed source backup at ${MIGRATION_ARCHIVE}..."
mongodump \
  --uri="$SOURCE_MONGODB_URI" \
  --db="$DATABASE_NAME" \
  --archive="$MIGRATION_ARCHIVE" \
  --gzip

echo "Restoring ${DATABASE_NAME} into the target MongoDB..."
mongorestore \
  --uri="$TARGET_MONGODB_URI" \
  --archive="$MIGRATION_ARCHIVE" \
  --gzip \
  --drop \
  --stopOnError \
  --nsInclude="${DATABASE_NAME}.*"

echo "Recording target collection counts..."
collection_counts "$TARGET_MONGODB_URI" > "$TARGET_COUNTS"

if cmp -s "$SOURCE_COUNTS" "$TARGET_COUNTS"; then
  echo "Migration completed successfully. Collection counts match."
  echo "Backup: ${MIGRATION_ARCHIVE}"
  exit 0
fi

echo "Migration completed, but collection counts differ." >&2
echo "Review the following files before starting the application:" >&2
echo "Source: ${SOURCE_COUNTS}" >&2
echo "Target: ${TARGET_COUNTS}" >&2
diff -u "$SOURCE_COUNTS" "$TARGET_COUNTS" || true
exit 2
