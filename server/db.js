import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";
import { hashPassword } from "./security.js";

const isPostgres = Boolean(config.databaseUrl);
const pgModule = isPostgres ? await import("pg") : null;
const Pool = pgModule?.default?.Pool;

function sqliteValue(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

function pgSql(sql) {
  let index = 0;
  return sql
    .replace(/\?/g, () => `$${++index}`)
    .replace(/\bAS\s+([a-z][A-Za-z0-9_]*[A-Z][A-Za-z0-9_]*)/g, 'AS "$1"');
}

function pgValues(values) {
  return values.map((value) => {
    if (typeof value === "boolean") return value ? 1 : 0;
    return value;
  });
}

class SqliteAdapter {
  constructor() {
    mkdirSync(dirname(config.databasePath), { recursive: true });
    this.client = new DatabaseSync(config.databasePath);
    this.client.exec("PRAGMA foreign_keys = ON");
    this.client.exec("PRAGMA journal_mode = WAL");
  }

  prepare(sql) {
    const stmt = this.client.prepare(sql);
    return {
      all: (...values) => stmt.all(...values.map(sqliteValue)),
      get: (...values) => stmt.get(...values.map(sqliteValue)),
      run: (...values) => stmt.run(...values.map(sqliteValue)),
    };
  }

  exec(sql) {
    return this.client.exec(sql);
  }
}

class PostgresAdapter {
  constructor() {
    this.pool = new Pool({ connectionString: config.databaseUrl });
  }

  prepare(sql) {
    return {
      all: async (...values) => (await this.pool.query(pgSql(sql), pgValues(values))).rows,
      get: async (...values) => (await this.pool.query(pgSql(sql), pgValues(values))).rows[0],
      run: async (...values) => {
        let text = pgSql(sql);
        const wantsId = /^\s*INSERT\s+/i.test(text) && !/\bRETURNING\b/i.test(text);
        if (wantsId) text += " RETURNING id";
        const result = await this.pool.query(text, pgValues(values));
        return {
          changes: result.rowCount,
          lastInsertRowid: result.rows[0]?.id,
        };
      },
    };
  }

  async exec(sql) {
    return this.pool.query(sql);
  }
}

export const db = isPostgres ? new PostgresAdapter() : new SqliteAdapter();
export const databaseEngine = isPostgres ? "postgresql" : "sqlite";

export async function initDatabase() {
  if (isPostgres) await initPostgres();
  else await initSqlite();
  await seedSettings();

  const userCount = (await db.prepare("SELECT COUNT(*) AS count FROM users").get()).count;
  if (Number(userCount) === 0) await seedDatabase();
}

async function initSqlite() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      title TEXT DEFAULT '',
      role TEXT NOT NULL CHECK(role IN ('admin','reception','therapist')),
      workdays TEXT NOT NULL DEFAULT '[]',
      service_ids TEXT NOT NULL DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      duration INTEGER NOT NULL CHECK(duration > 0),
      price REAL NOT NULL CHECK(price >= 0),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fname TEXT NOT NULL,
      lname TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT DEFAULT '',
      therapist_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      notes TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
      therapist_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','done','cancelled')),
      payment_status TEXT NOT NULL DEFAULT 'unpaid',
      paid_amount REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS clinic_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS client_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      original_name TEXT DEFAULT '',
      mime_type TEXT DEFAULT '',
      size INTEGER NOT NULL DEFAULT 0,
      path TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id INTEGER,
      details TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await ensureSqliteColumn("clients", "active", "INTEGER NOT NULL DEFAULT 1");
  await ensureSqliteColumn("categories", "active", "INTEGER NOT NULL DEFAULT 1");
  await ensureSqliteColumn("appointments", "active", "INTEGER NOT NULL DEFAULT 1");
  await ensureSqliteColumn("appointments", "payment_status", "TEXT NOT NULL DEFAULT 'unpaid'");
  await ensureSqliteColumn("appointments", "paid_amount", "REAL NOT NULL DEFAULT 0");
  await ensureSqliteColumn("client_files", "original_name", "TEXT DEFAULT ''");
  await ensureSqliteColumn("client_files", "mime_type", "TEXT DEFAULT ''");
  await ensureSqliteColumn("client_files", "size", "INTEGER NOT NULL DEFAULT 0");
  await ensureSqliteColumn("client_files", "path", "TEXT DEFAULT ''");
}

async function initPostgres() {
  const schema = readFileSync(new URL("./postgres/schema.sql", import.meta.url), "utf8");
  await db.exec(schema);
}

async function seedSettings() {
  const defaults = {
    clinicName: "CMS SUZAN",
    logoUrl: "/logo.svg",
    currency: "₪",
    workStart: "09:00",
    workEnd: "18:00",
    workDays: "[0,1,2,3,4,5]",
    whatsappTemplate: "שלום {client}, תזכורת לתור שלך ב-{clinic} בתאריך {date} בשעה {time}.",
  };
  const insert = db.prepare(`
    INSERT INTO clinic_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO NOTHING
  `);
  for (const [key, value] of Object.entries(defaults)) await insert.run(key, value);
}

async function ensureSqliteColumn(table, column, definition) {
  const columns = (await db.prepare(`PRAGMA table_info(${table})`).all()).map((row) => row.name);
  if (!columns.includes(column)) {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function seedDatabase() {
  const addUser = db.prepare(`
    INSERT INTO users (username, password_hash, name, title, role, workdays, service_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  await addUser.run("admin", hashPassword("ChangeMe123!"), "סוזאן", "מנהלת הקליניקה", "admin", "[]", "[]");
  await addUser.run("reception", hashPassword("ChangeMe123!"), "קבלה", "קבלה", "reception", "[]", "[]");
  await addUser.run("sara", hashPassword("ChangeMe123!"), "סארה", "מטפלת", "therapist", "[0,1,2,3,4]", "[1,2,3]");
  await addUser.run("lina", hashPassword("ChangeMe123!"), "לינה", "מטפלת", "therapist", "[1,3,4]", "[3,4,5]");

  const addCategory = db.prepare("INSERT INTO categories (name) VALUES (?)");
  await addCategory.run("גבות");
  await addCategory.run("טיפוח");
  await addCategory.run("צביעת שיער");
  await addCategory.run("איפור קבוע");

  const addService = db.prepare("INSERT INTO services (name, category_id, duration, price) VALUES (?, ?, ?, ?)");
  await addService.run("עיצוב גבות", 1, 60, 180);
  await addService.run("צביעת גבות", 1, 45, 150);
  await addService.run("ניקוי עור עמוק", 2, 90, 320);
  await addService.run("איפור קבוע לשפתיים", 4, 120, 600);
  await addService.run("צביעת שיער", 3, 120, 350);
}

export function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    title: row.title,
    role: row.role,
    workdays: JSON.parse(row.workdays || "[]"),
    serviceIds: JSON.parse(row.service_ids || "[]"),
    active: Boolean(row.active),
  };
}

export async function audit(userId, action, entity, entityId, details = {}) {
  await db.prepare("INSERT INTO audit_log (user_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)")
    .run(userId || null, action, entity, entityId || null, JSON.stringify(details));
}
