#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-cms-suzan}"
APP_DIR="${APP_DIR:-/var/www/cms-suzan}"
BRANCH="${BRANCH:-main}"

cd "$APP_DIR"

echo "==> Updating $APP_NAME from GitHub branch $BRANCH"
echo "==> Current version: $(cat VERSION 2>/dev/null || node -p "require('./package.json').version")"

echo "==> Creating database backup"
npm run backup

echo "==> Fetching latest code"
git fetch origin "$BRANCH" --tags
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "==> Installing production dependencies"
npm ci --omit=dev

echo "==> Running database initialization/migrations"
npm run init-db

echo "==> Reloading PM2 without manual downtime"
npm exec pm2 reload ecosystem.config.cjs --update-env
npm exec pm2 save

echo "==> New version: $(cat VERSION 2>/dev/null || node -p "require('./package.json').version")"
echo "==> Health check"
curl -fsS "http://127.0.0.1:${PORT:-3000}/api/health"
echo
