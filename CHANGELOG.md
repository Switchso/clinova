# Changelog

## 1.3.0

- Started the next SaaS infrastructure release.
- Added automatic backup configuration through environment variables.
- Added a PM2 backup worker (`cms-suzan-backup`) for scheduled backups.
- Improved backup creation for SQLite using a consistent SQLite export.
- Prepared backup flow for PostgreSQL using `pg_dump` when `DATABASE_URL` is active.
- Added backup retention cleanup.

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
