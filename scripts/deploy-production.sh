#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/ubuntu/MJ_FIrst_Promoter"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"

log() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"
}

cd "$APP_DIR"

log "Pulling origin/master into ${APP_DIR}..."
git fetch origin master
git reset --hard origin/master
log "Now at $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"

log "Installing backend dependencies..."
npm install --no-audit --no-fund

log "Installing frontend dependencies..."
(cd frontend && npm install --no-audit --no-fund)

log "Generating Prisma client..."
npx prisma generate

run_migrate() {
  npx prisma migrate deploy
}

mark_all_migrations_applied() {
  for dir in prisma/migrations/*/; do
    [[ -f "$dir/migration.sql" ]] || continue
    npx prisma migrate resolve --applied "$(basename "$dir")" 2>/dev/null || true
  done
}

sync_database() {
  local migrate_log
  migrate_log="$(mktemp)"

  log "Running prisma migrate deploy..."
  if run_migrate 2>&1 | tee "$migrate_log"; then
    rm -f "$migrate_log"
    log "Migrations applied."
    return 0
  fi

  log "migrate deploy failed; syncing schema with db push..."
  local failed_migration
  failed_migration="$(grep -oE 'Migration name: [0-9]{14}_[a-z0-9_]+' "$migrate_log" | head -1 | sed 's/Migration name: //' || true)"
  if [[ -n "$failed_migration" ]]; then
    npx prisma migrate resolve --rolled-back "$failed_migration" 2>/dev/null || true
  fi
  rm -f "$migrate_log"

  npx prisma db push
  mark_all_migrations_applied
  run_migrate
  log "Database sync complete."
}

sync_database

log "Building backend (tsc)..."
npx tsc

log "Building frontend..."
(cd frontend && NODE_OPTIONS="${NODE_OPTIONS}" npm run build)

if ! grep -q "gift-activity" dist/routes/chatter.routes.js; then
  log "ERROR: gift-activity route missing from compiled backend — aborting deploy."
  exit 1
fi
log "Verified gift-activity route in build output."

log "Restarting pm2..."
pm2 restart mj-promoter || pm2 restart all

PORT="$(grep -E '^PORT=' .env | cut -d= -f2- | tr -d '\r"' || true)"
PORT="${PORT:-5000}"

log "Waiting for health check on http://localhost:${PORT}/health ..."
for attempt in $(seq 1 45); do
  if curl -sf "http://localhost:${PORT}/health" >/dev/null; then
    log "Health check passed."
    exit 0
  fi
  sleep 2
done

log "Health check failed after 90s."
pm2 logs mj-promoter --lines 50 --nostream || true
exit 1
