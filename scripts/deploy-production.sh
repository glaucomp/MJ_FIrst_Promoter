#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/ubuntu/MJ_FIrst_Promoter"

cd "$APP_DIR"

git fetch origin master
git reset --hard origin/master

npm install
(cd frontend && npm install)

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

  if run_migrate 2>&1 | tee "$migrate_log"; then
    rm -f "$migrate_log"
    return 0
  fi

  echo "migrate deploy failed; syncing schema with db push..."
  local failed_migration
  failed_migration="$(grep -oE 'Migration name: [0-9]{14}_[a-z0-9_]+' "$migrate_log" | head -1 | sed 's/Migration name: //' || true)"
  if [[ -n "$failed_migration" ]]; then
    npx prisma migrate resolve --rolled-back "$failed_migration" 2>/dev/null || true
  fi
  rm -f "$migrate_log"

  npx prisma db push
  mark_all_migrations_applied
  run_migrate
}

sync_database

npm run build
pm2 restart mj-promoter || pm2 restart all
curl -sf http://localhost:5555/health
