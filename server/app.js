import { createServer } from "node:http";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { db, databaseEngine, initDatabase, rowToUser, audit } from "./db.js";
import { config } from "./config.js";
import { createBackup } from "./backup.js";
import { createSessionToken, hashPassword, readSignedToken, verifyPassword } from "./security.js";
import { renderReminderMessage, sendWhatsAppText, whatsappFallbackUrl } from "./whatsapp.js";

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
  consents: ["admin", "reception", "therapist"],
  consents_write: ["admin", "reception"],
  feedback: ["admin", "reception"],
  gifts: ["admin", "reception"],
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
  ".webp": "image/webp",
  ".pdf": "application/pdf",
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

function safeFileName(name) {
  const parsed = basename(String(name || "file")).replace(/[^\p{L}\p{N}._ -]/gu, "_").trim();
  return parsed || "file";
}

function contentDispositionName(name) {
  return encodeURIComponent(safeFileName(name)).replace(/['()]/g, escape);
}

function assertValidSqliteBackup(path) {
  const sqlite = new DatabaseSync(path, { readOnly: true });
  try {
    const row = sqlite.prepare("PRAGMA integrity_check").get();
    if (row.integrity_check !== "ok") {
      const error = new Error("SQLite backup integrity check failed.");
      error.status = 400;
      throw error;
    }
  } finally {
    sqlite.close();
  }
}

async function readRawBody(req, maxBytes = config.uploads.maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error(`הקובץ גדול מדי. הגודל המקסימלי הוא ${Math.round(maxBytes / 1024 / 1024)}MB`);
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readMultipart(req) {
  const contentType = req.headers["content-type"] || "";
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1] || contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2];
  if (!boundary) {
    const error = new Error("בקשת העלאה לא תקינה");
    error.status = 400;
    throw error;
  }

  const raw = await readRawBody(req);
  const body = raw.toString("latin1");
  const fields = {};
  const files = {};

  for (const part of body.split(`--${boundary}`)) {
    if (!part || part === "--\r\n" || part === "--") continue;
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const header = part.slice(0, headerEnd);
    let content = part.slice(headerEnd + 4);
    if (content.endsWith("\r\n")) content = content.slice(0, -2);
    if (content.endsWith("--")) content = content.slice(0, -2);

    const disposition = header.match(/content-disposition:\s*form-data;([^\r\n]+)/i)?.[1] || "";
    const name = disposition.match(/name="([^"]+)"/i)?.[1];
    if (!name) continue;
    const filename = disposition.match(/filename="([^"]*)"/i)?.[1];
    const type = header.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || "application/octet-stream";

    if (filename) {
      files[name] = {
        filename: safeFileName(filename),
        type,
        buffer: Buffer.from(content, "latin1"),
      };
    } else {
      fields[name] = Buffer.from(content, "latin1").toString("utf8");
    }
  }

  return { fields, files };
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
  const service = await db.prepare("SELECT duration, category_id, name FROM services WHERE id = ?").get(serviceId);
  if (!service) return null;
  const start = toMinutes(time);
  const end = start + service.duration;
  const rows = await db.prepare(`
    SELECT a.*, s.duration, s.name AS service_name, c.fname, c.lname
    FROM appointments a
    JOIN services s ON s.id = a.service_id
    JOIN clients c ON c.id = a.client_id
    WHERE a.date = ? AND a.status != 'cancelled' AND a.active = 1 AND s.category_id = ? AND a.id != ?
  `).all(date, service.category_id, id || 0);
  for (const row of rows) {
    const otherStart = toMinutes(row.time);
    const otherEnd = otherStart + row.duration;
    if (!(end <= otherStart || start >= otherEnd)) {
      return {
        code: "appointment_category_conflict",
        serviceName: row.service_name,
        clientName: `${row.fname} ${row.lname}`,
        time: row.time,
      };
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

async function consentTemplates() {
  return await db.prepare(`
    SELECT t.id, t.category_id AS categoryId, t.title, t.url, t.original_name AS originalName,
           t.mime_type AS mimeType, t.size, t.created_at AS createdAt, c.name AS categoryName
    FROM consent_templates t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.active = 1
    ORDER BY t.id DESC
  `).all();
}

async function consentTemplateById(id) {
  return await db.prepare(`
    SELECT id, category_id AS categoryId, title, url, original_name AS originalName, mime_type AS mimeType, size, path, active
    FROM consent_templates
    WHERE id = ? AND active = 1
  `).get(id);
}

async function consentSignatures() {
  return await db.prepare(`
    SELECT s.id, s.template_id AS templateId, s.client_id AS clientId, s.appointment_id AS appointmentId,
           s.signer_name AS signerName, s.signed_at AS signedAt, t.title AS templateTitle,
           c.fname || ' ' || c.lname AS clientName
    FROM consent_signatures s
    JOIN consent_templates t ON t.id = s.template_id
    LEFT JOIN clients c ON c.id = s.client_id
    ORDER BY s.id DESC
    LIMIT 100
  `).all();
}

function pdfSafeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "?")
    .slice(0, 120);
}

async function missingLegalConsents({ clientId, appointmentId, serviceId }) {
  const service = await db.prepare("SELECT category_id FROM services WHERE id = ?").get(serviceId);
  if (!service?.category_id) return [];
  const templates = await db.prepare(`
    SELECT id, title
    FROM consent_templates
    WHERE active = 1 AND category_id = ?
    ORDER BY id
  `).all(service.category_id);
  const missing = [];
  for (const template of templates) {
    const signature = await db.prepare(`
      SELECT id
      FROM consent_signatures
      WHERE template_id = ? AND (client_id = ? OR appointment_id = ?)
      LIMIT 1
    `).get(template.id, clientId || 0, appointmentId || 0);
    if (!signature) missing.push(template);
  }
  return missing;
}

async function createSignedConsentClientFile({ signatureId, templateId, clientId, appointmentId, signerName, signatureData }) {
  if (!clientId) return null;
  const template = await consentTemplateById(templateId);
  const client = await db.prepare("SELECT fname, lname FROM clients WHERE id = ?").get(clientId);
  if (!template || !client || !template.path || !existsSync(template.path)) return null;

  const clientDir = resolve(config.uploads.dir, "clients", String(clientId), "consents");
  mkdirSync(clientDir, { recursive: true });
  const fileName = `signed-consent-${signatureId}.pdf`;
  const target = resolve(clientDir, fileName);
  const signedAt = new Date().toISOString().slice(0, 19).replace("T", " ");

  const pdf = await PDFDocument.load(readFileSync(template.path));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage();
  const { width, height } = page.getSize();
  page.drawText("SIGNED LEGAL CONSENT", { x: 48, y: height - 70, size: 20, font, color: rgb(0.18, 0.42, 0.31) });
  page.drawText(`Form: ${pdfSafeText(template.title)}`, { x: 48, y: height - 110, size: 12, font });
  page.drawText(`Client: ${pdfSafeText(`${client.fname} ${client.lname}`)}`, { x: 48, y: height - 132, size: 12, font });
  page.drawText(`Signer: ${pdfSafeText(signerName)}`, { x: 48, y: height - 154, size: 12, font });
  page.drawText(`Appointment: ${appointmentId || "-"}`, { x: 48, y: height - 176, size: 12, font });
  page.drawText(`Signed at: ${signedAt}`, { x: 48, y: height - 198, size: 12, font });
  page.drawRectangle({ x: 48, y: height - 385, width: width - 96, height: 145, borderColor: rgb(0.18, 0.42, 0.31), borderWidth: 1 });
  page.drawText("Signature stamp", { x: 60, y: height - 260, size: 11, font, color: rgb(0.42, 0.55, 0.48) });

  const signatureBytes = Buffer.from(String(signatureData).split(",")[1] || "", "base64");
  if (signatureBytes.length) {
    const image = await pdf.embedPng(signatureBytes);
    const scaled = image.scaleToFit(width - 130, 105);
    page.drawImage(image, { x: 65, y: height - 370, width: scaled.width, height: scaled.height });
  }

  const stampedBytes = await pdf.save();
  writeFileSync(target, stampedBytes);

  const displayName = `Signed - ${template.title}`;
  const result = await db.prepare("INSERT INTO client_files (client_id, name, url, original_name, mime_type, size, path, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(clientId, displayName, "", fileName, "application/pdf", stampedBytes.length, target, "Signed legal consent");
  const downloadUrl = `/api/client-files/${result.lastInsertRowid}/download`;
  await db.prepare("UPDATE client_files SET url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(downloadUrl, result.lastInsertRowid);
  return result.lastInsertRowid;
}

async function feedbackRequests() {
  return await db.prepare(`
    SELECT f.id, f.appointment_id AS appointmentId, f.token, f.rating, f.comment, f.status,
           f.sent_at AS sentAt, f.submitted_at AS submittedAt,
           c.fname || ' ' || c.lname AS clientName, c.phone AS clientPhone,
           s.name AS serviceName, a.date, a.time
    FROM feedback_requests f
    JOIN appointments a ON a.id = f.appointment_id
    JOIN clients c ON c.id = a.client_id
    JOIN services s ON s.id = a.service_id
    ORDER BY f.id DESC
    LIMIT 120
  `).all();
}

async function giftCards() {
  return await db.prepare(`
    SELECT g.id, g.code, g.from_client_id AS fromClientId, g.to_client_id AS toClientId,
           g.service_id AS serviceId, g.sessions, g.message, g.status,
           g.created_at AS createdAt, g.redeemed_at AS redeemedAt,
           fc.fname || ' ' || fc.lname AS fromClientName,
           tc.fname || ' ' || tc.lname AS toClientName,
           tc.phone AS toClientPhone,
           s.name AS serviceName
    FROM gift_cards g
    LEFT JOIN clients fc ON fc.id = g.from_client_id
    LEFT JOIN clients tc ON tc.id = g.to_client_id
    LEFT JOIN services s ON s.id = g.service_id
    ORDER BY g.id DESC
  `).all();
}

async function clientFiles(clientId) {
  return await db.prepare(`
    SELECT id, client_id AS clientId, name, url, original_name AS originalName, mime_type AS mimeType, size, notes, created_at AS createdAt
    FROM client_files
    WHERE active = 1 AND client_id = ?
    ORDER BY id DESC
  `).all(clientId);
}

async function clientFileById(id) {
  return await db.prepare(`
    SELECT id, client_id AS clientId, name, url, original_name AS originalName, mime_type AS mimeType, size, path, notes, active
    FROM client_files
    WHERE id = ? AND active = 1
  `).get(id);
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

  if (method === "GET" && url.pathname.startsWith("/api/public/feedback/")) {
    const token = url.pathname.split("/").pop();
    const row = await db.prepare(`
      SELECT f.id, f.status, f.rating, f.comment, c.fname || ' ' || c.lname AS clientName,
             s.name AS serviceName, a.date, a.time
      FROM feedback_requests f
      JOIN appointments a ON a.id = f.appointment_id
      JOIN clients c ON c.id = a.client_id
      JOIN services s ON s.id = a.service_id
      WHERE f.token = ?
    `).get(token);
    if (!row) return json(res, 404, { error: "Feedback request not found." });
    return json(res, 200, row);
  }

  if (method === "POST" && url.pathname.startsWith("/api/public/feedback/")) {
    const token = url.pathname.split("/").pop();
    const body = await readBody(req);
    const rating = Math.max(1, Math.min(5, Number(body.rating || 0)));
    if (!rating) return json(res, 400, { error: "Rating is required." });
    const result = await db.prepare("UPDATE feedback_requests SET rating = ?, comment = ?, status = 'submitted', submitted_at = CURRENT_TIMESTAMP WHERE token = ?")
      .run(rating, String(body.comment || ""), token);
    if (!result.changes) return json(res, 404, { error: "Feedback request not found." });
    return json(res, 200, { ok: true });
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

  if (method === "POST" && url.pathname === "/api/system/restore") {
    const user = await requirePermission(req, res, "settings_write");
    if (!user) return;
    if (config.databaseUrl) return json(res, 400, { error: "Restore upload is available for SQLite. Use pg_restore for PostgreSQL backups." });
    const { files } = await readMultipart(req);
    const file = files.backup;
    if (!file || file.buffer.length === 0) return json(res, 400, { error: "Choose a backup file to restore." });
    const restoreDir = resolve(config.backup.dir, "restore-uploads");
    mkdirSync(restoreDir, { recursive: true });
    const source = resolve(restoreDir, `${Date.now()}-${safeFileName(file.filename)}`);
    writeFileSync(source, file.buffer);
    assertValidSqliteBackup(source);
    const safety = createBackup({ reason: "before-restore" });
    const pending = resolve(config.backup.dir, "pending-restore.sqlite");
    copyFileSync(source, pending);
    writeFileSync(resolve(config.backup.dir, "pending-restore.json"), JSON.stringify({
      uploadedName: file.filename,
      source,
      requestedBy: user.id,
      safetyBackup: safety.target,
      createdAt: new Date().toISOString(),
    }, null, 2));
    await audit(user.id, "restore_scheduled", "system", null, { source: file.filename, safetyBackup: safety.target });
    json(res, 200, { ok: true, safetyBackup: safety.target, restarting: true });
    setTimeout(() => process.exit(0), 500);
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
      consentTemplates: await consentTemplates(),
      consentSignatures: user.role === "admin" || user.role === "reception" ? await consentSignatures() : [],
      feedbackRequests: user.role === "admin" || user.role === "reception" ? await feedbackRequests() : [],
      giftCards: user.role === "admin" || user.role === "reception" ? await giftCards() : [],
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
    if (method === "POST") {
      const { fields, files } = await readMultipart(req);
      const file = files.file;
      if (!file || file.buffer.length === 0) return json(res, 400, { error: "יש לבחור קובץ להעלאה" });
      if (!config.uploads.allowedTypes.includes(file.type)) return json(res, 400, { error: "סוג הקובץ אינו נתמך" });

      const ext = extname(file.filename).toLowerCase();
      const clientDir = resolve(config.uploads.dir, "clients", String(id));
      mkdirSync(clientDir, { recursive: true });
      const storedName = `${Date.now()}-${randomUUID()}${ext}`;
      const target = resolve(clientDir, storedName);
      writeFileSync(target, file.buffer);

      const displayName = String(fields.name || file.filename).trim() || file.filename;
      const result = await db.prepare("INSERT INTO client_files (client_id, name, url, original_name, mime_type, size, path, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, displayName, "", file.filename, file.type, file.buffer.length, target, fields.notes || "");
      const downloadUrl = `/api/client-files/${result.lastInsertRowid}/download`;
      await db.prepare("UPDATE client_files SET url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(downloadUrl, result.lastInsertRowid);
      await audit(user.id, "create", "client_files", result.lastInsertRowid);
      return json(res, 201, { id: result.lastInsertRowid, url: downloadUrl });
    }
  }

  if (resource === "client-files" && method === "GET" && id && parts[3] === "download") {
    const user = await requirePermission(req, res, "clients_read");
    if (!user) return;
    const file = await clientFileById(id);
    if (!file) return json(res, 404, { error: "הקובץ לא נמצא" });
    if (!await canSeeClient(user, file.clientId)) return json(res, 403, { error: "אין הרשאה לקובץ זה" });
    if (!file.path) {
      res.writeHead(302, { Location: file.url });
      res.end();
      return;
    }
    if (!existsSync(file.path)) return json(res, 404, { error: "הקובץ לא נמצא באחסון" });
    const buffer = readFileSync(file.path);
    res.writeHead(200, {
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Length": buffer.length,
      "Content-Disposition": `inline; filename*=UTF-8''${contentDispositionName(file.originalName || file.name)}`,
      "X-Content-Type-Options": "nosniff",
    });
    res.end(buffer);
    return;
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
    if (method === "POST" && id && parts[3] === "whatsapp") {
      const appointment = (await listAppointments(user)).find((item) => item.id === id);
      if (!appointment) return json(res, 404, { error: "התור לא נמצא" });
      const settings = await clinicSettings();
      const message = renderReminderMessage(appointment, settings);
      const result = await sendWhatsAppText({ to: appointment.clientPhone, message });
      await audit(user.id, result.ok ? "whatsapp_sent" : "whatsapp_fallback", "appointments", id, {
        configured: result.configured !== false,
        dryRun: Boolean(result.dryRun),
        messageId: result.messageId || "",
      });
      return json(res, 200, {
        ...result,
        fallbackUrl: result.fallbackUrl || whatsappFallbackUrl(appointment.clientPhone, message),
      });
    }
    if (method === "GET") return json(res, 200, await listAppointments(user));
    if (method === "DELETE" && id) {
      await db.prepare("UPDATE appointments SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
      await audit(user.id, "archive", "appointments", id);
      return json(res, 200, { ok: true });
    }
    const body = await readBody(req);
    const therapistId = user.role === "therapist" ? user.id : body.therapistId;
    const conflict = await appointmentConflict({ id, date: body.date, time: body.time, serviceId: body.serviceId, therapistId });
    if (conflict) return json(res, 409, { error: "appointment_category_conflict", details: conflict });
    if ((body.status || "pending") === "done") {
      const missingConsents = await missingLegalConsents({ clientId: body.clientId, appointmentId: id, serviceId: body.serviceId });
      if (missingConsents.length) {
        return json(res, 409, { error: "consent_required", details: { missing: missingConsents } });
      }
    }
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

  if (resource === "consents") {
    const user = await requirePermission(req, res, method === "GET" || parts[3] === "sign" ? "consents" : "consents_write");
    if (!user) return;
    if (method === "POST" && id && parts[3] === "sign") {
      const body = await readBody(req);
      if (!body.signatureData || !String(body.signatureData).startsWith("data:image/")) return json(res, 400, { error: "Signature is required." });
      const result = await db.prepare("INSERT INTO consent_signatures (template_id, client_id, appointment_id, signer_name, signature_data) VALUES (?, ?, ?, ?, ?)")
        .run(id, body.clientId || null, body.appointmentId || null, String(body.signerName || ""), body.signatureData);
      const fileId = await createSignedConsentClientFile({
        signatureId: result.lastInsertRowid,
        templateId: id,
        clientId: body.clientId || null,
        appointmentId: body.appointmentId || null,
        signerName: String(body.signerName || ""),
        signatureData: body.signatureData,
      });
      await audit(user.id, "sign", "consent_templates", id, { signatureId: result.lastInsertRowid, clientFileId: fileId });
      return json(res, 201, { id: result.lastInsertRowid, clientFileId: fileId });
    }
    if (method === "GET" && id && parts[3] === "download") {
      const file = await consentTemplateById(id);
      if (!file) return json(res, 404, { error: "Consent file not found." });
      if (!existsSync(file.path)) return json(res, 404, { error: "Consent file missing from storage." });
      const buffer = readFileSync(file.path);
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Length": buffer.length,
        "Content-Disposition": `inline; filename*=UTF-8''${contentDispositionName(file.originalName || file.title)}`,
        "X-Content-Type-Options": "nosniff",
      });
      res.end(buffer);
      return;
    }
    if (method === "GET") return json(res, 200, await consentTemplates());
    if (method === "POST") {
      const { fields, files } = await readMultipart(req);
      const file = files.file;
      if (!file || file.buffer.length === 0) return json(res, 400, { error: "Choose a PDF file." });
      if (file.type !== "application/pdf") return json(res, 400, { error: "Only PDF consent files are supported." });
      const consentDir = resolve(config.uploads.dir, "consents");
      mkdirSync(consentDir, { recursive: true });
      const storedName = `${Date.now()}-${randomUUID()}.pdf`;
      const target = resolve(consentDir, storedName);
      writeFileSync(target, file.buffer);
      const result = await db.prepare("INSERT INTO consent_templates (category_id, title, url, original_name, mime_type, size, path) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(fields.categoryId || null, String(fields.title || file.filename).trim(), "", file.filename, file.type, file.buffer.length, target);
      const downloadUrl = `/api/consents/${result.lastInsertRowid}/download`;
      await db.prepare("UPDATE consent_templates SET url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(downloadUrl, result.lastInsertRowid);
      await audit(user.id, "create", "consent_templates", result.lastInsertRowid);
      return json(res, 201, { id: result.lastInsertRowid, url: downloadUrl });
    }
    if (method === "DELETE" && id) {
      await db.prepare("UPDATE consent_templates SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
      await audit(user.id, "archive", "consent_templates", id);
      return json(res, 200, { ok: true });
    }
  }

  if (resource === "feedback") {
    const user = await requirePermission(req, res, "feedback");
    if (!user) return;
    if (method === "GET") return json(res, 200, await feedbackRequests());
    if (method === "POST") {
      const body = await readBody(req);
      const appointment = (await listAppointments(user)).find((item) => item.id === Number(body.appointmentId));
      if (!appointment) return json(res, 404, { error: "Appointment not found." });
      const token = randomUUID();
      const result = await db.prepare("INSERT INTO feedback_requests (appointment_id, token) VALUES (?, ?)").run(appointment.id, token);
      const proto = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const link = `${proto}://${host}/feedback.html?token=${encodeURIComponent(token)}`;
      const message = `שלום ${appointment.clientName}, נשמח לקבל חוות דעת קצרה אחרי הטיפול: ${link}`;
      const sent = await sendWhatsAppText({ to: appointment.clientPhone, message });
      await audit(user.id, sent.ok ? "feedback_whatsapp_sent" : "feedback_whatsapp_fallback", "feedback_requests", result.lastInsertRowid);
      return json(res, 201, { id: result.lastInsertRowid, ...sent, fallbackUrl: sent.fallbackUrl || whatsappFallbackUrl(appointment.clientPhone, message) });
    }
  }

  if (resource === "gifts") {
    const user = await requirePermission(req, res, "gifts");
    if (!user) return;
    if (method === "GET") return json(res, 200, await giftCards());
    if (method === "POST" && id && parts[3] === "whatsapp") {
      const gift = (await giftCards()).find((item) => item.id === id);
      if (!gift) return json(res, 404, { error: "Gift card not found." });
      const message = `🎁 ${gift.toClientName || ""}, קיבלת מתנה מ-${gift.fromClientName || "CMS SUZAN"}: ${gift.sessions} جلسة ${gift.serviceName || ""}. קוד המתנה: ${gift.code}. ${gift.message || ""}`;
      const sent = await sendWhatsAppText({ to: gift.toClientPhone, message });
      await audit(user.id, sent.ok ? "gift_whatsapp_sent" : "gift_whatsapp_fallback", "gift_cards", id);
      return json(res, 200, { ...sent, fallbackUrl: sent.fallbackUrl || whatsappFallbackUrl(gift.toClientPhone, message) });
    }
    if (method === "POST") {
      const body = await readBody(req);
      const code = `GIFT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const result = await db.prepare("INSERT INTO gift_cards (code, from_client_id, to_client_id, service_id, sessions, message) VALUES (?, ?, ?, ?, ?, ?)")
        .run(code, body.fromClientId || null, body.toClientId || null, body.serviceId || null, Math.max(1, Number(body.sessions || 1)), String(body.message || ""));
      await audit(user.id, "create", "gift_cards", result.lastInsertRowid);
      return json(res, 201, { id: result.lastInsertRowid, code });
    }
    if (method === "PUT" && id) {
      const body = await readBody(req);
      await db.prepare("UPDATE gift_cards SET status = ?, redeemed_at = CASE WHEN ? = 'redeemed' THEN CURRENT_TIMESTAMP ELSE redeemed_at END WHERE id = ?")
        .run(body.status || "active", body.status || "active", id);
      await audit(user.id, "update", "gift_cards", id);
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
