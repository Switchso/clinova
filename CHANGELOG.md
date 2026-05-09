# Changelog

## 1.3.0

- Started the next SaaS infrastructure release.
- Added automatic backup configuration through environment variables.
- Added a PM2 backup worker (`cms-suzan-backup`) for scheduled backups.
- Improved backup creation for SQLite using a consistent SQLite export.
- Prepared backup flow for PostgreSQL using `pg_dump` when `DATABASE_URL` is active.
- Added backup retention cleanup.
- Added database adapter support for PostgreSQL through `DATABASE_URL`.
- Added PostgreSQL schema and updated SQLite-to-PostgreSQL migration to include settings, client files, and payment fields.
- Updated health check to show the active database engine.
- Added professional client file uploads with type and size validation.
- Added protected download links for uploaded client files.
- Added upload storage settings and excluded uploaded files from Git.
- Added WhatsApp Cloud API integration for appointment reminders.
- Added safe WhatsApp fallback links when the API is not configured.
- Added environment-based WhatsApp credentials so tokens are never stored in the database or UI.

## 1.2.0

- Added formal version tracking with `VERSION`, `package.json`, and `/api/version`.
- Prepared GitHub-based deployment workflow for continuous server updates.
- Switched PM2 config to cluster mode so `pm2 reload` can update with minimal downtime.
- Added production update scripts for pulling from GitHub, installing dependencies, migrating DB, backing up, and reloading PM2.

## 1.1.0

- Added Hebrew UI support and expanded Hebrew coverage across the main system.
- Added safer category archiving.
- Improved quick search behavior and result positioning.

## 1.0.0

- Initial production clinic management system.
