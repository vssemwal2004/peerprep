#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 UNIVERSITY_ID NEW_DIRECTORY" >&2
  exit 2
fi

university_id="$1"
target_dir="$2"
if [[ ! "$university_id" =~ ^[a-z0-9][a-z0-9-]{1,62}$ ]]; then
  echo "University ID must be lowercase letters, numbers and hyphens." >&2
  exit 2
fi
if [[ -e "$target_dir" ]]; then
  echo "Target already exists: $target_dir" >&2
  exit 2
fi

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$target_dir"
rsync -a \
  --exclude .git --exclude .aws --exclude .codex --exclude .agents \
  --exclude node_modules --exclude dist --exclude logs --exclude '.env*' \
  --exclude '*.log' --exclude .DS_Store \
  "$repo_dir/" "$target_dir/"
cat > "$target_dir/backend/.env" <<EOF
NODE_ENV=production
PEERPREP_DEPLOYMENT_ROLE=university
PEERPREP_UNIVERSITY_ID=$university_id
PEERPREP_CONTROL_URL=https://CHANGE_ME_CONTROL_HOST
PEERPREP_SHARED_API_KEY=CHANGE_ME_ONE_TIME_KEY
PEERPREP_INSPECTION_PUBLIC_KEY=CHANGE_ME_BASE64_PUBLIC_KEY
MONGODB_URI=mongodb://CHANGE_ME_UNIVERSITY_DB
FRONTEND_ORIGIN=https://CHANGE_ME_FRONTEND_HOST
EOF
cat > "$target_dir/frontend/.env.production" <<EOF
VITE_PEERPREP_DEPLOYMENT_ROLE=university
VITE_API_URL=https://CHANGE_ME_BACKEND_HOST/api
EOF
git -C "$target_dir" init -q
echo "Created separate codebase at $target_dir. Complete its env files, then deploy to its VPS."
