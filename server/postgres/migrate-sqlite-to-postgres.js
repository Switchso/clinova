import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required. Example: postgres://user:pass@host:5432/cms_suzan");
  process.exit(1);
}

const sqlite = new DatabaseSync(config.databasePath, { readOnly: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
    await client.query(schema);

    await clearTables(client);
    await copyUsers(client);
    await copyCategories(client);
    await copyServices(client);
    await copyClients(client);
    await copyAppointments(client);
    await copySettings(client);
    await copyClientFiles(client);
    await copyAudit(client);
    await resetSequences(client);

    await client.query("COMMIT");
    console.log("SQLite data migrated to PostgreSQL successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

async function clearTables(client) {
  await client.query("TRUNCATE audit_log, sessions, client_files, clinic_settings, appointments, clients, services, categories, users RESTART IDENTITY CASCADE");
}

async function copyUsers(client) {
  const rows = sqlite.prepare("SELECT * FROM users ORDER BY id").all();
  for (const row of rows) {
    await client.query(
      `INSERT INTO users (id, username, password_hash, name, title, role, workdays, service_ids, active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [row.id, row.username, row.password_hash, row.name, row.title || "", row.role, row.workdays || "[]", row.service_ids || "[]", Number(row.active ?? 1), row.created_at, row.updated_at]
    );
  }
}

async function copyCategories(client) {
  const rows = sqlite.prepare("SELECT * FROM categories ORDER BY id").all();
  for (const row of rows) {
    await client.query(
      "INSERT INTO categories (id, name, active, created_at, updated_at) VALUES ($1,$2,$3,$4,$5)",
      [row.id, row.name, Number(row.active ?? 1), row.created_at, row.updated_at]
    );
  }
}

async function copyServices(client) {
  const rows = sqlite.prepare("SELECT * FROM services ORDER BY id").all();
  for (const row of rows) {
    await client.query(
      `INSERT INTO services (id, name, category_id, duration, price, active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [row.id, row.name, row.category_id, row.duration, row.price, Number(row.active ?? 1), row.created_at, row.updated_at]
    );
  }
}

async function copyClients(client) {
  const rows = sqlite.prepare("SELECT * FROM clients ORDER BY id").all();
  for (const row of rows) {
    await client.query(
      `INSERT INTO clients (id, fname, lname, phone, email, therapist_id, notes, active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [row.id, row.fname, row.lname, row.phone, row.email || "", row.therapist_id || null, row.notes || "", Number(row.active ?? 1), row.created_at, row.updated_at]
    );
  }
}

async function copyAppointments(client) {
  const rows = sqlite.prepare("SELECT * FROM appointments ORDER BY id").all();
  for (const row of rows) {
    await client.query(
      `INSERT INTO appointments (id, client_id, service_id, therapist_id, date, time, status, payment_status, paid_amount, notes, active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        row.id,
        row.client_id,
        row.service_id,
        row.therapist_id,
        row.date,
        row.time,
        row.status,
        row.payment_status || "unpaid",
        row.paid_amount || 0,
        row.notes || "",
        Number(row.active ?? 1),
        row.created_at,
        row.updated_at,
      ]
    );
  }
}

async function copySettings(client) {
  const rows = sqlite.prepare("SELECT * FROM clinic_settings ORDER BY key").all();
  for (const row of rows) {
    await client.query(
      "INSERT INTO clinic_settings (key, value, updated_at) VALUES ($1,$2,$3)",
      [row.key, row.value, row.updated_at]
    );
  }
}

async function copyClientFiles(client) {
  const rows = sqlite.prepare("SELECT * FROM client_files ORDER BY id").all();
  for (const row of rows) {
    await client.query(
      `INSERT INTO client_files (id, client_id, name, url, original_name, mime_type, size, path, notes, active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        row.id,
        row.client_id,
        row.name,
        row.url,
        row.original_name || "",
        row.mime_type || "",
        row.size || 0,
        row.path || "",
        row.notes || "",
        Number(row.active ?? 1),
        row.created_at,
        row.updated_at,
      ]
    );
  }
}

async function copyAudit(client) {
  const rows = sqlite.prepare("SELECT * FROM audit_log ORDER BY id").all();
  for (const row of rows) {
    await client.query(
      `INSERT INTO audit_log (id, user_id, action, entity, entity_id, details, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [row.id, row.user_id || null, row.action, row.entity, row.entity_id || null, row.details || "{}", row.created_at]
    );
  }
}

async function resetSequences(client) {
  for (const table of ["users", "categories", "services", "clients", "appointments", "client_files", "audit_log"]) {
    await client.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), true)`);
  }
}

main();
