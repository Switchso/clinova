# Clinic Management System

Production-ready clinic management app with a Node.js server, SQLite database, secure password hashing, session cookies, role permissions, and a browser UI.

## Features

- Secure login with hashed passwords and server-side sessions.
- Role-based access for admin, reception, and therapists.
- Clients, appointments, services, categories, and users management.
- Appointment conflict detection.
- Reports and revenue summaries.
- Admin audit log.
- CSV export for clients and appointments.
- SQLite backup script.

## Run locally

```bash
copy .env.example .env
npm run init-db
npm start
```

Open `http://localhost:3000`.

## Version

Current version is tracked in:

- `VERSION`
- `package.json`
- `/api/version`
- `/api/health`

Default admin after first run:

- Username: `admin`
- Password: `ChangeMe123!`

Change this password immediately from the users screen.
Users can also change their own password from the settings page.

## Deploy

1. Install Node.js 22.5+ on the server.
2. Upload this folder.
3. Run `npm install`.
4. Copy `.env.production.example` to `.env`.
4. Set a strong `SESSION_SECRET`.
5. Set `COOKIE_SECURE=true` when serving over HTTPS.
6. Run `npm run init-db`.
7. Run `npm run pm2:start` behind Nginx reverse proxy.

For GitHub-based updates, see [deploy/github-server-link.md](deploy/github-server-link.md).

Production update command on the server:

```bash
cd /var/www/cms-suzan
bash deploy/update-from-github.sh
```

The SQLite database is stored under `data/clinic.sqlite` by default. Back up the `data` folder regularly.

## PostgreSQL

For daily multi-user production, use PostgreSQL.

Create database and user:

```sql
CREATE DATABASE cms_suzan;
CREATE USER cms_suzan_user WITH ENCRYPTED PASSWORD 'CHANGE_ME';
GRANT ALL PRIVILEGES ON DATABASE cms_suzan TO cms_suzan_user;
```

Set `DATABASE_URL` in `.env`:

```bash
DATABASE_URL=postgres://cms_suzan_user:CHANGE_ME@127.0.0.1:5432/cms_suzan
```

Load schema and migrate SQLite data into PostgreSQL:

```bash
npm run pg:migrate
```

The included file [server/postgres/schema.sql](server/postgres/schema.sql) contains the PostgreSQL schema.

Note: the current runtime still uses SQLite unless the app is later switched fully to PostgreSQL query adapters. The migration script prepares your production PostgreSQL database and data for that switch.

## Backup

```bash
npm run backup
```

This creates a timestamped copy under `backups/`.

## Restore

Stop the server first, then run:

```bash
npm run restore -- backups/clinic.sqlite.YYYY-MM-DD.bak
```

Start the server again after restore.

## Production Checklist

- Change all default passwords before real use.
- Set a long random `SESSION_SECRET` in `.env`.
- Use HTTPS and set `COOKIE_SECURE=true`.
- Run daily backups and periodically test restore.
- Prefer PM2 or a system service so the app restarts after crashes/reboots.
- Use `/api/health` for monitoring.

## Nginx reverse proxy example

Use:

```bash
sudo cp deploy/nginx/cms-suzan.conf /etc/nginx/sites-available/cms-suzan
sudo ln -s /etc/nginx/sites-available/cms-suzan /etc/nginx/sites-enabled/cms-suzan
sudo nginx -t
sudo systemctl reload nginx
```
