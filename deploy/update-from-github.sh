#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-cms-suzan}"
APP_DIR="${APP_DIR:-/var/www/cms-suzan}"
BRANCH="${BRANCH:-main}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${PORT:-3000}/api/health}"
LOCK_DIR="${LOCK_DIR:-/tmp/cms-suzan-deploy.lock}"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "Another deployment is already running: $LOCK_DIR"
  exit 1
fi
trap 'rm -rf "$LOCK_DIR"' EXIT

cd "$APP_DIR"

echo "==> Updating $APP_NAME from GitHub branch $BRANCH"
echo "==> Current version: $(cat VERSION 2>/dev/null || node -p "require('./package.json').version")"
echo "==> Current commit: $(git rev-parse --short HEAD 2>/dev/null || true)"

echo "==> Creating database backup"
npm run backup

echo "==> Fetching latest code"
git fetch origin "$BRANCH" --tags
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "==> Installing production dependencies"
npm ci --omit=dev

echo "==> Running database initialization/migrations"
npm run init-db

echo "==> Reloading PM2 without manual downtime"
npm exec pm2 startOrReload ecosystem.config.cjs --update-env
npm exec pm2 save

echo "==> New version: $(cat VERSION 2>/dev/null || node -p "require('./package.json').version")"
echo "==> New commit: $(git rev-parse --short HEAD 2>/dev/null || true)"
echo "==> Health check"
for attempt in 1 2 3 4 5; do
  if curl -fsS "$HEALTH_URL"; then
    echo
    echo "==> Deployment completed"
    exit 0
  fi
  echo "Health check failed, retry $attempt/5"
  sleep 3
done

echo "Deployment finished but health check failed: $HEALTH_URL"
exit 1
