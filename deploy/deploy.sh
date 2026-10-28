#!/usr/bin/env bash
# Build and (re)start Kestrel on the server. Safe to run again. See docs/DEPLOY.md.
set -euo pipefail

ROOT="${KESTREL_ROOT:-/opt/kestrel}"
cd "$ROOT"

if [ ! -f .env ]; then
  echo "deploy: $ROOT/.env is missing. Create it from .env.example first (docs/DEPLOY.md)." >&2
  exit 1
fi
chmod 600 .env

# Read only the Caddy settings from .env, without printing them or loading the rest.
env_value() { sed -n "s/^$1=//p" .env | tail -n 1 | sed -e "s/^['\"]//" -e "s/['\"]$//"; }
for key in KESTREL_HOST KESTREL_USER KESTREL_PASS_HASH; do
  value="$(env_value "$key")"
  if [ -z "$value" ]; then
    echo "deploy: $key is not set in .env." >&2
    exit 1
  fi
  export "$key=$value"
done
export KESTREL_ROOT="$ROOT"

git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
# Apply pending schema changes before the API restarts; a no-op without DATABASE_URL.
pnpm db:migrate

if pm2 describe kestrel-api > /dev/null 2>&1; then
  pm2 restart kestrel-api
else
  pm2 start "pnpm start" --name kestrel-api --cwd "$ROOT/apps/api"
fi
pm2 save

caddy reload --config deploy/Caddyfile --adapter caddyfile
echo "deploy: done."
