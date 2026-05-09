import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { db, databaseEngine, initDatabase, rowToUser, audit } from "./db.js";
import { config } from "./config.js";
import { createBackup } from "./backup.js";
import { createSessionToken, hashPassword, readSignedToken, verifyPassword } from "./security.js";

await initDatabase();
if (process.argv.includes("--init-db")) {
  console.log(`Database ready: ${config.databaseUrl ? "PostgreSQL" : config.databasePath}`);
  process.exit(0);
}

const publicDir = resolve("client");
const packageInfo = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const permissions = {
  users: ["admin"],
  categories: ["admin"],
  services: ["admin"],
  reports: ["admin"],
  audit: ["admin"],
  settings_write: ["admin"],
  clients_read: ["admin", "reception", "therapist"],
  clients_write: ["admin", "reception"],
  appointments_read: ["admin", "reception", "therapist"],
  appointments_write: ["admin", "reception", "therapist"],
  appointments_delete: ["admin"],
};

const loginAttempts = new Map();
const maxLoginAttempts = 5;
const loginWindowMs = 15 * 60 * 1000;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
}

function loginKey(req, username) {
  return `${clientIp(req)}:${String(username || "").toLowerCase()}`;
}

function isLoginBlocked(req, username) {
  const item = loginAttempts.get(loginKey(req, username));
  if (!item) return false;
  if (Date.now() - item.firstAt > loginWindowMs) {
    loginAttempts.delete(loginKey(req, username));
    return false;
  }
  return item.count >= maxLoginAttempts;
}

function recordFailedLogin(req, username) {
  const key = loginKey(req, username);
  const now = Date.now();
  const item = loginAttempts.get(key);
  if (!item || now - item.firstAt > loginWindowMs) {
    loginAttempts.set(key, { count: 1, firstAt: now });
    return;
  }
  item.count += 1;
}

function clearFailedLogin(req, username) {
  loginAttempts.delete(loginKey(req, username));
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(header.split(";").map((item) => {
    const index = item.indexOf("=");
    return index === -1 ? ["", ""] : [item.slice(0, index).trim(), decodeURIComponent(item.slice(index + 1))];
  }).filter(([key]) => key));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Invalid JSON body");
    error.status = 400;
    throw error;
  }
}

function setSessionCookie(res, token, expiresAt) {
  const secure = config.cookieSecure ? "; Secure" : "";
  res.setHeader("Set-Cookie", `clinic_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Expires=${new Date(expiresAt).toUTCString()}${secure}`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "clinic_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

async function currentUser(req) {
  const token = parseCookies(req).clinic_session;
  const id = readSignedToken(token, config.sessionSecret);
  if (!id) return null;
  const now = Date.now();
  const session = await db.prepare("SELECT user_id FROM sessions WHERE id = ? AND expires_at > ?").get(id, now);
  if (!session) return null;
  return rowToUser(await db.prepare("SELECT * FROM users WHERE id = ? AND active = 1").get(session.user_id));
}

async function requireUser(req, res) {
  const user = await currentUser(req);
  if (!user) {
    json(res, 401, { error: "يجب تسجيل الدخول" });
    return null;
  }
  return user;
}

async function requirePermission(req, res, key) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (!permissions[key]?.includes(user.role)) {
    json(res, 403, { error: "لا تملك صلاحية لهذه العملية" });
    return null;
  }
  return user;
}

function parseJsonArray(value) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

async function serviceMap() {
  return new Map((await db.prepare("SELECT id, duration FROM services").all()).map((row) => [row.id, row]));
}

async function appointmentConflict({ id, date, time, serviceId, therapistId }) {
  const service = await db.prepare("SELECT duration FROM services WHERE id = ?").get(serviceId);
  if (!service) return null;
  const start = toMinutes(time);
  const end = start + service.duration;
  const rows = await db.prepare(`
    SELECT a.*, s.duration, c.fname, c.lname
    FROM appointments a
    JOIN services s ON s.id = a.service_id
    JOIN clients c ON c.id = a.client_id
    WHERE a.date = ? AND a.status != 'cancelled' AND a.active = 1 AND a.therapist_id = ? AND a.id != ?
  `).all(date, therapistId, id || 0);
  for (const row of rows) {
    const otherStart = toMinutes(row.time);
    const otherEnd = otherStart + row.duration;
    if (!(end <= otherStart || start >= otherEnd)) {
      return `يوجد موعد متعارض مع ${row.fname} ${row.lname} في ${row.time}`;
    }
  }
  return null;
}

function toMinutes(time) {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  return hours * 60 + minutes;
}

async function listAppointments(user) {
  const base = `
    SELECT a.*, c.fname, c.lname, c.phone, s.name AS service_name, s.duration, s.price, u.name AS therapist_name
    FROM appointments a
    JOIN clients c ON c.id = a.client_id
    JOIN services s ON s.id = a.service_id
    JOIN users u ON u.id = a.therapist_id
  `;
  const rows = user.role === "therapist"
    ? await db.prepare(`${base} WHERE a.active = 1 AND a.therapist_id = ? ORDER BY a.date DESC, a.time DESC`).all(user.id)
    : await db.prepare(`${base} WHERE a.active = 1 ORDER BY a.date DESC, a.time DESC`).all();
  return rows.map((row) => ({
    id: row.id,
    clientId: row.client_id,
    clientName: `${row.fname} ${row.lname}`,
    clientPhone: row.phone,
    serviceId: row.service_id,
    serviceName: row.service_name,
    therapistId: row.therapist_id,
    therapistName: row.therapist_name,
    date: row.date,
    time: row.time,
    status: row.status,
    notes: row.notes,
    duration: row.duration,
    price: row.price,
    paymentStatus: row.payment_status || "unpaid",
    paidAmount: Number(row.paid_amount || 0),
  }));
}

async function listClients(user) {
  const rows = user.role === "therapist"
    ? await db.prepare("SELECT * FROM clients WHERE active = 1 AND therapist_id = ? ORDER BY updated_at DESC").all(user.id)
    : await db.prepare("SELECT * FROM clients WHERE active = 1 ORDER BY updated_at DESC").all();
  return rows.map((row) => ({
    id: row.id,
    fname: row.fname,
    lname: row.lname,
    phone: row.phone,
    email: row.email,
    therapistId: row.therapist_id,
    notes: row.notes,
  }));
}

async function clinicSettings() {
  const rows = await db.prepare("SELECT key, value FROM clinic_settings ORDER BY key").all();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

async function updateClinicSettings(values) {
  const allowed = ["clinicName", "logoUrl", "currency", "workStart", "workEnd", "workDays", "whatsappTemplate"];
  const stmt = await db.prepare(`
    INSERT INTO clinic_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(values, key)) stmt.run(key, String(values[key] ?? ""));
  }
}

async function clientFiles(clientId) {
  return await db.prepare(`
    SELECT id, client_id AS clientId, name, url, notes, created_at AS createdAt
    FROM client_files
    WHERE active = 1 AND client_id = ?
    ORDER BY id DESC
  `).all(clientId);
}

async function canSeeClient(user, clientId) {
  if (user.role !== "therapist") return true;
  const row = await db.prepare("SELECT id FROM clients WHERE id = ? AND active = 1 AND therapist_id = ?").get(clientId, user.id);
  return Boolean(row);
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function searchScore(text, query, phone = "") {
  const source = String(text || "").toLowerCase();
  const needle = String(query || "").toLowerCase();
  const phoneNeedle = digitsOnly(query);
  let score = 0;
  if (source.includes(needle)) score += source.startsWith(needle) ? 80 : 45;
  if (phoneNeedle && digitsOnly(phone).includes(phoneNeedle)) score += 70;
  for (const part of needle.split(/\s+/).filter(Boolean)) if (source.includes(part)) score += 12;
  return score;
}

async function api(req, res, url) {
  const method = req.method;

  if (method === "GET" && url.pathname === "/api/health") {
    const dbCheck = await db.prepare("SELECT 1 AS ok").get();
    const checks = {
      database: Boolean(dbCheck?.ok),
      databaseEngine,
      time: new Date().toISOString(),
    };
    json(res, 200, { ok: checks.database, version: packageInfo.version, checks });
    return;
  }

  if (method === "GET" && url.pathname === "/api/version") {
    json(res, 200, {
      name: "CMS SUZAN",
      version: packageInfo.version,
      node: process.version,
      environment: process.env.NODE_ENV || "development",
    });
    return;
  }

  if (method === "POST" && url.pathname === "/api/login") {
    const body = await readBody(req);
    if (isLoginBlocked(req, body.username)) {
      json(res, 429, { error: "محاولات دخول كثيرة. حاول مرة أخرى بعد 15 دقيقة" });
      return;
    }
    const row = await db.prepare("SELECT * FROM users WHERE username = ? AND active = 1").get(body.username || "");
    if (!row || !verifyPassword(body.password || "", row.password_hash)) {
      recordFailedLogin(req, body.username);
      json(res, 401, { error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
      return;
    }
    clearFailedLogin(req, body.username);
    const token = createSessionToken(config.sessionSecret);
    const id = token.split(".")[0];
    const expiresAt = Date.now() + 1000 * 60 * 60 * 12;
    await db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(id, row.id, expiresAt);
    setSessionCookie(res, token, expiresAt);
    await audit(row.id, "login", "session", null);
    json(res, 200, { user: rowToUser(row) });
    return;
  }

  if (method === "POST" && url.pathname === "/api/logout") {
    const token = parseCookies(req).clinic_session;
    const id = readSignedToken(token, config.sessionSecret);
    if (id) await db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    clearSessionCookie(res);
    json(res, 200, { ok: true });
    return;
  }

  if (method === "POST" && url.pathname === "/api/account/password") {
    const user = await requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    if (!body.newPassword || String(body.newPassword).length < 8) {
      json(res, 400, { error: "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل" });
      return;
    }
    const row = await db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
    if (!row || !verifyPassword(body.currentPassword || "", row.password_hash)) {
      json(res, 400, { error: "كلمة المرور الحالية غير صحيحة" });
      return;
    }
    await db.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(hashPassword(body.newPassword), user.id);
    await db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
    clearSessionCookie(res);
    await audit(user.id, "change_password", "users", user.id);
    json(res, 200, { ok: true });
    return;
  }

  if (method === "GET" && url.pathname === "/api/me") {
    const user = await currentUser(req);
    json(res, 200, { user });
    return;
  }

  if (method === "GET" && url.pathname === "/api/search") {
    const user = await requireUser(req, res);
    if (!user) return;
    const term = String(url.searchParams.get("q") || "").trim();
    if (term.length < 2) return json(res, 200, { clients: [], appointments: [], services: [] });
    const like = `%${term}%`;
    const digitTerm = `%${digitsOnly(term)}%`;
    const clientSql = user.role === "therapist"
      ? "SELECT c.*, u.name AS therapistName FROM clients c LEFT JOIN users u ON u.id = c.therapist_id WHERE c.active = 1 AND c.therapist_id = ? ORDER BY c.updated_at DESC LIMIT 80"
      : "SELECT c.*, u.name AS therapistName FROM clients c LEFT JOIN users u ON u.id = c.therapist_id WHERE c.active = 1 ORDER BY c.updated_at DESC LIMIT 120";
    const clientRows = user.role === "therapist" ? await db.prepare(clientSql).all(user.id) : await db.prepare(clientSql).all();
    const clients = clientRows
      .map((row) => {
        const name = `${row.fname} ${row.lname}`;
        const score = searchScore(`${name} ${row.email || ""} ${row.notes || ""} ${row.therapistName || ""}`, term, row.phone);
        return { id: row.id, name, phone: row.phone, email: row.email, therapistName: row.therapistName || "", score };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    const apptBase = `
      SELECT a.id, a.date, a.time, a.status, a.payment_status AS paymentStatus,
             c.id AS clientId, c.fname || ' ' || c.lname AS clientName, c.phone AS clientPhone,
             s.name AS serviceName, u.name AS therapistName
      FROM appointments a
      JOIN clients c ON c.id = a.client_id
      JOIN services s ON s.id = a.service_id
      JOIN users u ON u.id = a.therapist_id
      WHERE a.active = 1 AND (c.fname LIKE ? OR c.lname LIKE ? OR c.phone LIKE ? OR REPLACE(c.phone, '-', '') LIKE ? OR s.name LIKE ? OR u.name LIKE ? OR a.date LIKE ? OR a.status LIKE ? OR a.payment_status LIKE ?)
    `;
    const apptRows = user.role === "therapist"
      ? await db.prepare(`${apptBase} AND a.therapist_id = ? ORDER BY a.date DESC, a.time DESC LIMIT 10`).all(like, like, like, digitTerm, like, like, like, like, like, user.id)
      : await db.prepare(`${apptBase} ORDER BY a.date DESC, a.time DESC LIMIT 10`).all(like, like, like, digitTerm, like, like, like, like, like);
    const serviceRows = user.role === "admin" || user.role === "reception"
      ? await db.prepare("SELECT s.id, s.name, s.duration, s.price, c.name AS categoryName FROM services s JOIN categories c ON c.id = s.category_id WHERE s.active = 1 AND (s.name LIKE ? OR c.name LIKE ?) ORDER BY s.name LIMIT 8").all(like, like)
      : [];
    json(res, 200, { clients, appointments: apptRows, services: serviceRows });
    return;
  }

  if (method === "GET" && url.pathname === "/api/settings") {
    const user = await requireUser(req, res);
    if (!user) return;
    json(res, 200, { settings: await clinicSettings() });
    return;
  }

  if (method === "PUT" && url.pathname === "/api/settings") {
    const user = await requirePermission(req, res, "settings_write");
    if (!user) return;
    const body = await readBody(req);
    await updateClinicSettings(body);
    await audit(user.id, "update", "settings", null);
    json(res, 200, { settings: await clinicSettings() });
    return;
  }

  if (method === "GET" && url.pathname === "/api/system/export") {
    const user = await requirePermission(req, res, "settings_write");
    if (!user) return;
    const exportBackup = createBackup({ reason: "download-export" });
    const backup = readFileSync(exportBackup.target);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    res.writeHead(200, {
      "Content-Type": config.databaseUrl ? "application/octet-stream" : "application/vnd.sqlite3",
      "Content-Disposition": `attachment; filename="cms-suzan-${stamp}.${config.databaseUrl ? "dump" : "sqlite"}"`,
      "Content-Length": backup.length,
      "X-Content-Type-Options": "nosniff",
    });
    res.end(backup);
    await audit(user.id, "export", "system", null);
    return;
  }

  if (method === "GET" && url.pathname === "/api/bootstrap") {
    const user = await requireUser(req, res);
    if (!user) return;
    json(res, 200, {
      user,
      users: (await db.prepare("SELECT * FROM users ORDER BY id").all()).map(rowToUser),
      categories: await db.prepare("SELECT * FROM categories WHERE active = 1 ORDER BY name").all(),
      services: await db.prepare("SELECT id, name, category_id AS categoryId, duration, price, active FROM services ORDER BY name").all(),
      clients: await listClients(user),
      appointments: await listAppointments(user),
      settings: await clinicSettings(),
      audits: user.role === "admin" ? await listAudit() : [],
    });
    return;
  }

  await crudRoutes(req, res, url);
}

async function crudRoutes(req, res, url) {
  const method = req.method;
  const parts = url.pathname.split("/").filter(Boolean);
  const resource = parts[1];
  const id = parts[2] ? Number(parts[2]) : null;

  if (resource === "users") {
    const user = await requirePermission(req, res, "users");
    if (!user) return;
    if (method === "GET") return json(res, 200, (await db.prepare("SELECT * FROM users ORDER BY id").all()).map(rowToUser));
    const body = await readBody(req);
    if (method === "POST") {
      const result = await db.prepare("INSERT INTO users (username, password_hash, name, title, role, workdays, service_ids, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(body.username, hashPassword(body.password), body.name, body.title || "", body.role, parseJsonArray(body.workdays), parseJsonArray(body.serviceIds), body.active === false ? 0 : 1);
      await audit(user.id, "create", "users", result.lastInsertRowid);
      return json(res, 201, { id: result.lastInsertRowid });
    }
    if (method === "PUT" && id) {
      const passwordPart = body.password ? ", password_hash = ?" : "";
      const values = body.password
        ? [body.username, body.name, body.title || "", body.role, parseJsonArray(body.workdays), parseJsonArray(body.serviceIds), body.active === false ? 0 : 1, hashPassword(body.password), id]
        : [body.username, body.name, body.title || "", body.role, parseJsonArray(body.workdays), parseJsonArray(body.serviceIds), body.active === false ? 0 : 1, id];
      await db.prepare(`UPDATE users SET username = ?, name = ?, title = ?, role = ?, workdays = ?, service_ids = ?, active = ?, updated_at = CURRENT_TIMESTAMP${passwordPart} WHERE id = ?`).run(...values);
      await audit(user.id, "update", "users", id);
      return json(res, 200, { ok: true });
    }
    if (method === "DELETE" && id) {
      await db.prepare("UPDATE users SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
      await audit(user.id, "deactivate", "users", id);
      return json(res, 200, { ok: true });
    }
  }

  if (resource === "categories") {
    const user = await requirePermission(req, res, "categories");
    if (!user) return;
    if (method === "GET") return json(res, 200, await db.prepare("SELECT * FROM categories WHERE active = 1 ORDER BY name").all());
    const body = await readBody(req);
    if (method === "POST") {
      const result = await db.prepare("INSERT INTO categories (name) VALUES (?)").run(body.name);
      await audit(user.id, "create", "categories", result.lastInsertRowid);
      return json(res, 201, { id: result.lastInsertRowid });
    }
    if (method === "PUT" && id) {
      await db.prepare("UPDATE categories SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(body.name, id);
      await audit(user.id, "update", "categories", id);
      return json(res, 200, { ok: true });
    }
    if (method === "DELETE" && id) {
      await db.prepare("UPDATE categories SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
      await db.prepare("UPDATE services SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE category_id = ?").run(id);
      await audit(user.id, "archive", "categories", id);
      return json(res, 200, { ok: true });
    }
  }

  if (resource === "services") {
    const user = await requirePermission(req, res, "services");
    if (!user) return;
    if (method === "GET") return json(res, 200, await db.prepare("SELECT id, name, category_id AS categoryId, duration, price, active FROM services ORDER BY name").all());
    const body = await readBody(req);
    if (method === "POST") {
      const result = await db.prepare("INSERT INTO services (name, category_id, duration, price, active) VALUES (?, ?, ?, ?, ?)").run(body.name, body.categoryId, body.duration, body.price, body.active === false ? 0 : 1);
      await audit(user.id, "create", "services", result.lastInsertRowid);
      return json(res, 201, { id: result.lastInsertRowid });
    }
    if (method === "PUT" && id) {
      await db.prepare("UPDATE services SET name = ?, category_id = ?, duration = ?, price = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(body.name, body.categoryId, body.duration, body.price, body.active === false ? 0 : 1, id);
      await audit(user.id, "update", "services", id);
      return json(res, 200, { ok: true });
    }
    if (method === "DELETE" && id) {
      await db.prepare("UPDATE services SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
      await audit(user.id, "deactivate", "services", id);
      return json(res, 200, { ok: true });
    }
  }

  if (resource === "clients" && id && parts[3] === "history" && method === "GET") {
    const user = await requirePermission(req, res, "clients_read");
    if (!user) return;
    if (!await canSeeClient(user, id)) return json(res, 403, { error: "لا تملك صلاحية لهذا العميل" });
    const client = (await listClients(user)).find((item) => item.id === id);
    const appointments = (await listAppointments(user)).filter((item) => item.clientId === id);
    return json(res, 200, { client, appointments, files: await clientFiles(id) });
  }

  if (resource === "clients" && id && parts[3] === "files") {
    const user = await requirePermission(req, res, method === "GET" ? "clients_read" : "clients_write");
    if (!user) return;
    if (!await canSeeClient(user, id)) return json(res, 403, { error: "لا تملك صلاحية لهذا العميل" });
    if (method === "GET") return json(res, 200, await clientFiles(id));
    const body = await readBody(req);
    if (method === "POST") {
      const result = await db.prepare("INSERT INTO client_files (client_id, name, url, notes) VALUES (?, ?, ?, ?)")
        .run(id, body.name, body.url, body.notes || "");
      await audit(user.id, "create", "client_files", result.lastInsertRowid);
      return json(res, 201, { id: result.lastInsertRowid });
    }
  }

  if (resource === "client-files" && method === "DELETE" && id) {
    const user = await requirePermission(req, res, "clients_write");
    if (!user) return;
    await db.prepare("UPDATE client_files SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    await audit(user.id, "archive", "client_files", id);
    return json(res, 200, { ok: true });
  }

  if (resource === "clients") {
    const user = await requirePermission(req, res, method === "GET" ? "clients_read" : "clients_write");
    if (!user) return;
    if (method === "GET") return json(res, 200, await listClients(user));
    const body = await readBody(req);
    if (method === "POST") {
      const result = await db.prepare("INSERT INTO clients (fname, lname, phone, email, therapist_id, notes) VALUES (?, ?, ?, ?, ?, ?)").run(body.fname, body.lname, body.phone, body.email || "", body.therapistId || null, body.notes || "");
      await audit(user.id, "create", "clients", result.lastInsertRowid);
      return json(res, 201, { id: result.lastInsertRowid });
    }
    if (method === "PUT" && id) {
      await db.prepare("UPDATE clients SET fname = ?, lname = ?, phone = ?, email = ?, therapist_id = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(body.fname, body.lname, body.phone, body.email || "", body.therapistId || null, body.notes || "", id);
      await audit(user.id, "update", "clients", id);
      return json(res, 200, { ok: true });
    }
    if (method === "DELETE" && id) {
      await db.prepare("UPDATE clients SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
      await db.prepare("UPDATE appointments SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE client_id = ?").run(id);
      await audit(user.id, "archive", "clients", id);
      return json(res, 200, { ok: true });
    }
  }

  if (resource === "appointments") {
    const key = method === "DELETE" ? "appointments_delete" : method === "GET" ? "appointments_read" : "appointments_write";
    const user = await requirePermission(req, res, key);
    if (!user) return;
    if (method === "GET") return json(res, 200, await listAppointments(user));
    if (method === "DELETE" && id) {
      await db.prepare("UPDATE appointments SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
      await audit(user.id, "archive", "appointments", id);
      return json(res, 200, { ok: true });
    }
    const body = await readBody(req);
    const therapistId = user.role === "therapist" ? user.id : body.therapistId;
    const conflict = await appointmentConflict({ id, date: body.date, time: body.time, serviceId: body.serviceId, therapistId });
    if (conflict) return json(res, 409, { error: conflict });
    const paymentStatus = ["paid", "unpaid", "deposit"].includes(body.paymentStatus) ? body.paymentStatus : "unpaid";
    const paidAmount = Number(body.paidAmount || 0);
    if (method === "POST") {
      const result = await db.prepare("INSERT INTO appointments (client_id, service_id, therapist_id, date, time, status, payment_status, paid_amount, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(body.clientId, body.serviceId, therapistId, body.date, body.time, body.status || "pending", paymentStatus, paidAmount, body.notes || "");
      await audit(user.id, "create", "appointments", result.lastInsertRowid);
      return json(res, 201, { id: result.lastInsertRowid });
    }
    if (method === "PUT" && id) {
      await db.prepare("UPDATE appointments SET client_id = ?, service_id = ?, therapist_id = ?, date = ?, time = ?, status = ?, payment_status = ?, paid_amount = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(body.clientId, body.serviceId, therapistId, body.date, body.time, body.status || "pending", paymentStatus, paidAmount, body.notes || "", id);
      await audit(user.id, "update", "appointments", id);
      return json(res, 200, { ok: true });
    }
  }

  if (resource === "reports") {
    const user = await requirePermission(req, res, "reports");
    if (!user) return;
    const rows = await db.prepare(`
      SELECT a.status, a.date, s.price, s.name AS service_name, u.name AS therapist_name
      FROM appointments a
      JOIN services s ON s.id = a.service_id
      JOIN users u ON u.id = a.therapist_id
      WHERE a.active = 1
    `).all();
    const done = rows.filter((row) => row.status === "done");
    const revenue = done.reduce((sum, row) => sum + Number(row.price), 0);
    return json(res, 200, {
      totalAppointments: rows.length,
      completedAppointments: done.length,
      pendingAppointments: rows.filter((row) => row.status === "pending").length,
      cancelledAppointments: rows.filter((row) => row.status === "cancelled").length,
      totalRevenue: revenue,
      averageAppointment: done.length ? Math.round(revenue / done.length) : 0,
    });
  }

  if (resource === "audit") {
    const user = await requirePermission(req, res, "audit");
    if (!user) return;
    return json(res, 200, await listAudit());
  }

  json(res, 404, { error: "المسار غير موجود" });
}

async function listAudit() {
  const rows = await db.prepare(`
    SELECT a.id, a.action, a.entity, a.entity_id AS entityId, a.details, a.created_at AS createdAt, u.name AS userName
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.id DESC
    LIMIT 100
  `).all();
  return rows.map((row) => ({
    ...row,
    details: JSON.parse(row.details || "{}"),
  }));
}

function serveStatic(req, res, url) {
  let filePath = join(publicDir, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(publicDir, "index.html");
  }
  const ext = extname(filePath);
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(readFileSync(filePath));
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await api(req, res, url);
      return;
    }
    serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    json(res, error.status || 500, { error: error.message || "حدث خطأ في السيرفر" });
  }
});

server.listen(config.port, config.host, () => {
  console.log(`Clinic system running on http://${config.host}:${config.port}`);
});
