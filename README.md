# Clinova

Production-ready clinic management app with a Node.js server, external PostgreSQL support, local SQLite fallback for development, secure password hashing, session cookies, role permissions, and a browser UI.

## Features

- Secure login with hashed passwords and server-side sessions.
- Role-based access for admin, reception, and therapists.
- Clients, appointments, services, categories, and users management.
- Appointment conflict detection.
- Reports and revenue summaries.
- Admin audit log.
- CSV export for clients and appointments.
- SQLite and PostgreSQL backup script.

## Run locally

```bash
copy .env.example .env
npm run init-db
npm run db:check
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
cd /var/www/clinova
bash deploy/update-from-github.sh
```

SQLite is used only when `DATABASE_URL` is empty. For production or a database server on another machine, set `DATABASE_URL` to your PostgreSQL connection string.

## External Database

For daily multi-user production, use PostgreSQL on a separate database server.

Create database and user:

```sql
CREATE DATABASE clinova;
CREATE USER clinova_user WITH ENCRYPTED PASSWORD 'CHANGE_ME';
GRANT ALL PRIVILEGES ON DATABASE clinova TO clinova_user;
```

Set `DATABASE_URL` in `.env`:

```bash
DATABASE_URL=postgres://clinova_user:CHANGE_ME@DB_SERVER_IP:5432/clinova
DATABASE_SSL=false
```

If your database provider requires SSL, use:

```bash
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=true
```

Initialize the external database and verify the connection:

```bash
npm run init-db
npm run db:check
```

To migrate existing SQLite data into PostgreSQL:

```bash
npm run pg:migrate
```

The included file [server/postgres/schema.sql](server/postgres/schema.sql) contains the PostgreSQL schema.
When `DATABASE_URL` is set, Clinova runs directly on PostgreSQL.

## Backup

```bash
npm run backup
```

This creates a timestamped copy under `backups/`. PostgreSQL backups require the `pg_dump` command to be installed on the application server.

## Restore

SQLite restore only: stop the server first, then run:

```bash
npm run restore -- backups/clinic.sqlite.YYYY-MM-DD.bak
```

Start the server again after restore.

For PostgreSQL, restore with `pg_restore` on the database server.

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
sudo cp deploy/nginx/clinova.conf /etc/nginx/sites-available/clinova
sudo ln -s /etc/nginx/sites-available/clinova /etc/nginx/sites-enabled/clinova
sudo nginx -t
sudo systemctl reload nginx
```
