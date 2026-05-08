import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";
import { hashPassword } from "./security.js";

mkdirSync(dirname(config.databasePath), { recursive: true });
export const db = new DatabaseSync(config.databasePath);
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");

export function initDatabase() {
  db.exec(`
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

  ensureColumn("clients", "active", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn("categories", "active", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn("appointments", "active", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn("appointments", "payment_status", "TEXT NOT NULL DEFAULT 'unpaid'");
  ensureColumn("appointments", "paid_amount", "REAL NOT NULL DEFAULT 0");
  seedSettings();

  const userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (userCount === 0) seedDatabase();
}

function seedSettings() {
  const defaults = {
    clinicName: "CMS SUZAN",
    logoUrl: "/logo.svg",
    currency: "₪",
    workStart: "09:00",
    workEnd: "18:00",
    workDays: "[0,1,2,3,4,5]",
    whatsappTemplate: "مرحبا {client}، نذكرك بموعدك في {clinic} بتاريخ {date} الساعة {time}.",
  };
  const insert = db.prepare("INSERT OR IGNORE INTO clinic_settings (key, value) VALUES (?, ?)");
  Object.entries(defaults).forEach(([key, value]) => insert.run(key, value));
}

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function seedDatabase() {
  const addUser = db.prepare(`
    INSERT INTO users (username, password_hash, name, title, role, workdays, service_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  addUser.run("admin", hashPassword("ChangeMe123!"), "سوزان", "مديرة العيادة", "admin", "[]", "[]");
  addUser.run("reception", hashPassword("ChangeMe123!"), "موظفة الاستقبال", "استقبال", "reception", "[]", "[]");
  addUser.run("sara", hashPassword("ChangeMe123!"), "سارة", "معالجة", "therapist", "[0,1,2,3,4]", "[1,2,3]");
  addUser.run("lina", hashPassword("ChangeMe123!"), "لينا", "معالجة", "therapist", "[1,3,4]", "[3,4,5]");

  const addCategory = db.prepare("INSERT INTO categories (name) VALUES (?)");
  addCategory.run("الحواجب");
  addCategory.run("التجميل");
  addCategory.run("صبغ الشعر");
  addCategory.run("المكياج الدائم");

  const addService = db.prepare("INSERT INTO services (name, category_id, duration, price) VALUES (?, ?, ?, ?)");
  addService.run("تصميم حواجب", 1, 60, 180);
  addService.run("صبغ حواجب", 1, 45, 150);
  addService.run("تنظيف بشرة عميق", 2, 90, 320);
  addService.run("مكياج دائم للشفاه", 4, 120, 600);
  addService.run("صبغ شعر", 3, 120, 350);
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

export function audit(userId, action, entity, entityId, details = {}) {
  db.prepare("INSERT INTO audit_log (user_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)")
    .run(userId || null, action, entity, entityId || null, JSON.stringify(details));
}
