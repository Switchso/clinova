#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:?Set REPO_URL, example: git@github.com:YOUR_USER/clinova.git}"
APP_DIR="${APP_DIR:-/var/www/clinova}"
BRANCH="${BRANCH:-main}"

echo "==> Cloning Clinova"
sudo mkdir -p "$(dirname "$APP_DIR")"
sudo chown "$USER":"$USER" "$(dirname "$APP_DIR")"

if [ ! -d "$APP_DIR/.git" ]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

echo "==> Installing dependencies"
npm ci --omit=dev

if [ ! -f .env ]; then
  cp .env.production.example .env
  echo "==> Created .env. Edit it now and set SESSION_SECRET before public use."
fi

echo "==> Initializing database"
npm run init-db

echo "==> Starting with PM2"
npm exec pm2 start ecosystem.config.cjs
npm exec pm2 save

echo "==> Install complete. Configure Nginx and HTTPS next."
