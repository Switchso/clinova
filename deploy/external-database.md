# Clinova External Database

Use this setup when the Clinova app and PostgreSQL database run on different servers.

## 1. Database Server

Install PostgreSQL, then create the database and user:

```sql
CREATE DATABASE clinova;
CREATE USER clinova_user WITH ENCRYPTED PASSWORD 'CHANGE_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE clinova TO clinova_user;
\c clinova
GRANT ALL ON SCHEMA public TO clinova_user;
```

Allow the app server IP in `pg_hba.conf`, for example:

```conf
host    clinova    clinova_user    APP_SERVER_IP/32    scram-sha-256
```

Set PostgreSQL to listen on the needed network interface in `postgresql.conf`:

```conf
listen_addresses = '*'
```

Restart PostgreSQL after changing these files.

## 2. App Server

In the Clinova `.env` file:

```env
DATABASE_URL=postgres://clinova_user:CHANGE_STRONG_PASSWORD@DB_SERVER_IP:5432/clinova
DATABASE_SSL=false
DATABASE_CONNECTION_TIMEOUT_MS=10000
```

If your database provider requires SSL:

```env
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=true
```

Then initialize and test:

```bash
npm run init-db
npm run db:check
```

When `DATABASE_URL` is set, Clinova uses PostgreSQL and ignores `DATABASE_PATH`.

## 3. Backups

PostgreSQL backups use `pg_dump`:

```bash
npm run backup
```

Restore PostgreSQL backups with `pg_restore` on the database server or from a machine that can reach it.
