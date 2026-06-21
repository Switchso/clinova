# Clinova Production Deploy

This package is prepared for a new production server.

## Requirements

- Node.js 22 or newer
- PostgreSQL 14 or newer for real production
- `pg_dump` installed on the app server if automated PostgreSQL backups are enabled
- Nginx or another reverse proxy with HTTPS

## Install

```bash
cd /var/www/clinova
npm ci --omit=dev
cp .env.production.example .env
mkdir -p data uploads backups logs
```

Edit `.env` before starting:

```env
PORT=3000
HOST=127.0.0.1
DATABASE_URL=postgres://clinova_user:CHANGE_STRONG_PASSWORD@DB_SERVER_IP:5432/clinova
SESSION_SECRET=CHANGE_TO_A_LONG_RANDOM_SECRET_AT_LEAST_48_CHARS
COOKIE_SECURE=true
UPLOAD_DIR=./uploads
BACKUP_DIR=./backups
```

For a temporary single-server SQLite deployment, leave `DATABASE_URL` empty and keep:

```env
DATABASE_PATH=./data/clinic.sqlite
```

## Start

```bash
npm run db:check
npm run pm2:start
npm run pm2:save
```

Health check:

```bash
curl http://127.0.0.1:3000/api/health
```

## Nginx

Use `deploy/nginx/clinova.conf` as a base config, then set your real domain and SSL paths.

## Important

- Do not upload local `node_modules`, `data`, `uploads`, `backups`, or `logs` from development.
- Keep `.env` only on the server and never commit it.
- Use PostgreSQL for commercial SaaS production and point `DATABASE_URL` to the external database server.
- Run backups and test restore before going live.
