import { createServer } from "node:http";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { db, databaseEngine, initDatabase, rowToUser, audit, findLoginUser, provisionTenant } from "./db.js";
import { config } from "./config.js";
import { createBackup } from "./backup.js";
import { createSessionToken, hashPassword, readSignedToken, verifyPassword } from "./security.js";
import { renderReminderMessage, sendWhatsAppText, whatsappFallbackUrl } from "./whatsapp.js";
import { json } from "./shared/http/json-response.js";
import { inviteUrl } from "./shared/http/url-helpers.js";
import { serveStatic } from "./shared/http/static-server.js";

await initDatabase();
if (process.argv.includes("--init-db")) {
  console.log(`Database ready: ${config.databaseUrl ? "PostgreSQL" : config.databasePath}`);
  process.exit(0);
}

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
  crm: ["admin", "reception", "therapist"],
  crm_write: ["admin", "reception", "therapist"],
  appointments_read: ["admin", "reception", "therapist"],
  appointments_write: ["admin", "reception", "therapist"],
  appointments_delete: ["admin"],
};

const planCatalog = {
  starter: { name: "Starter", monthlyPrice: 49, maxUsers: 5, maxClients: 200, whatsapp: false, billing: false },
  growth: { name: "Growth", monthlyPrice: 99, maxUsers: 10, maxClients: 2000, whatsapp: true, billing: false },
  scale: { name: "Scale", monthlyPrice: 199, maxUsers: null, maxClients: null, whatsapp: true, billing: true },
};

setInterval(() => {
  runAutomaticBilling().catch((err) => console.error("Automatic billing failed:", err));
}, 6 * 60 * 60 * 1000).unref();

const loginAttempts = new Map();
const maxLoginAttempts = 5;
const loginWindowMs = 15 * 60 * 1000;

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
      const error = new Error(`׳”׳§׳•׳‘׳¥ ׳’׳“׳•׳ ׳׳“׳™. ׳”׳’׳•׳“׳ ׳”׳׳§׳¡׳™׳׳׳™ ׳”׳•׳ ${Math.round(maxBytes / 1024 / 1024)}MB`);
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
    const error = new Error("׳‘׳§׳©׳× ׳”׳¢׳׳׳” ׳׳ ׳×׳§׳™׳ ׳”");
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
  const session = await db.prepare("SELECT tenant_id, user_id FROM sessions WHERE id = ? AND expires_at > ?").get(id, now);
  if (!session) return null;
  return rowToUser(await db.prepare("SELECT * FROM users WHERE id = ? AND tenant_id = ? AND active = 1").get(session.user_id, session.tenant_id || 1));
}

async function requireUser(req, res) {
  const user = await currentUser(req);
  if (!user) {
    json(res, 401, { error: "״¬״¨ ״×״³״¬„ ״§„״¯״®ˆ„" });
    return null;
  }
  return user;
}

async function requirePermission(req, res, key) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (user.platformOwner) {
    json(res, 403, { error: "Platform owners must use the platform administration API." });
    return null;
  }
  if (!permissions[key]?.includes(user.role)) {
    json(res, 403, { error: "„״§ ״×…„ƒ ״µ„״§״­״© „‡״°‡ ״§„״¹…„״©" });
    return null;
  }
  return user;
}

async function requirePlatformOwner(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (!user.platformOwner) {
    json(res, 403, { error: "Platform owner access is required." });
    return null;
  }
  return user;
}

function parseJsonArray(value) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

function parseTags(value) {
  if (Array.isArray(value)) return JSON.stringify(value.map(String).filter(Boolean));
  return JSON.stringify(String(value || "").split(",").map((item) => item.trim()).filter(Boolean));
}

function jsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function planLimits(plan) {
  return planCatalog[plan] || planCatalog.starter;
}

function limitReached(current, max) {
  return max !== null && max !== undefined && Number(current || 0) >= Number(max);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(dateText, days) {
  const date = new Date(`${dateText || todayIso()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function addMonthsIso(dateText, months = 1) {
  const date = new Date(`${dateText || todayIso()}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + Number(months || 0));
  return date.toISOString().slice(0, 10);
}

function clampBillingDay(year, monthIndex, day) {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return Math.min(Math.max(Number(day || 1), 1), lastDay);
}

function billingDateForMonth(dateText, billingDay) {
  const date = new Date(`${dateText || todayIso()}T00:00:00.000Z`);
  const day = clampBillingDay(date.getUTCFullYear(), date.getUTCMonth(), billingDay);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function billingCycleKey(dateText) {
  return String(dateText || todayIso()).slice(0, 7);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeDomain(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function validDomain(value) {
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(value) && !value.includes("..");
}

function renderTemplate(template, values) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value ?? "")), String(template || ""));
}

async function tenantBilling(tenantId = 1) {
  const tenant = await db.prepare("SELECT id, name, slug, status, plan, billing_email AS billingEmail, trial_ends_at AS trialEndsAt FROM tenants WHERE id = ?").get(tenantId);
  const subscription = await db.prepare(`
    SELECT id, provider, provider_customer_id AS providerCustomerId, provider_subscription_id AS providerSubscriptionId,
           status, plan, current_period_end AS currentPeriodEnd, created_at AS createdAt, updated_at AS updatedAt
    FROM subscriptions
    WHERE tenant_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(tenantId);
  const plan = subscription?.plan || tenant?.plan || "starter";
  const usage = {
    users: Number((await db.prepare("SELECT COUNT(*) AS count FROM users WHERE tenant_id = ? AND active = 1 AND COALESCE(is_platform_owner, 0) = 0").get(tenantId)).count || 0),
    clients: Number((await db.prepare("SELECT COUNT(*) AS count FROM clients WHERE tenant_id = ? AND active = 1").get(tenantId)).count || 0),
  };
  const invoices = await db.prepare(`
    SELECT id, number, status, currency, amount, period_start AS periodStart, period_end AS periodEnd,
           due_at AS dueAt, paid_at AS paidAt, notes, created_at AS createdAt, updated_at AS updatedAt
    FROM billing_invoices
    WHERE tenant_id = ?
    ORDER BY id DESC
    LIMIT 12
  `).all(tenantId);
  return {
    tenant,
    subscription,
    plan,
    status: subscription?.status || tenant?.status || "trial",
    limits: planLimits(plan),
    usage,
    invoices,
    catalog: planCatalog,
  };
}

async function tenantDomains(tenantId = 1) {
  return db.prepare(`
    SELECT id, domain, status, is_primary AS isPrimary, verified_at AS verifiedAt, created_at AS createdAt, updated_at AS updatedAt
    FROM tenant_domains
    WHERE tenant_id = ?
    ORDER BY is_primary DESC, id DESC
  `).all(tenantId);
}

async function platformTenants() {
  const tenants = await db.prepare(`
    SELECT t.id, t.name, t.slug, t.status, t.plan, t.billing_email AS billingEmail, t.trial_ends_at AS trialEndsAt,
           t.created_at AS createdAt, t.updated_at AS updatedAt,
           COALESCE(s.status, t.status) AS subscriptionStatus, COALESCE(s.plan, t.plan) AS subscriptionPlan,
           s.current_period_end AS currentPeriodEnd, COALESCE(s.billing_day, 1) AS billingDay,
           COALESCE(s.auto_billing_enabled, 0) AS autoBillingEnabled
    FROM tenants t
    LEFT JOIN subscriptions s ON s.id = (
      SELECT id FROM subscriptions WHERE tenant_id = t.id ORDER BY id DESC LIMIT 1
    )
    ORDER BY t.id DESC
  `).all();
  return Promise.all(tenants.map(async (tenant) => {
    const invoiceRows = await db.prepare(`
      SELECT id, number, status, currency, amount, period_start AS periodStart, period_end AS periodEnd,
             due_at AS dueAt, paid_at AS paidAt, notes, billing_cycle AS billingCycle, created_at AS createdAt, updated_at AS updatedAt
      FROM billing_invoices
      WHERE tenant_id = ?
      ORDER BY id DESC
      LIMIT 50
    `).all(tenant.id);
    return {
      ...tenant,
      users: Number((await db.prepare("SELECT COUNT(*) AS count FROM users WHERE tenant_id = ? AND active = 1 AND COALESCE(is_platform_owner, 0) = 0").get(tenant.id)).count || 0),
      clients: Number((await db.prepare("SELECT COUNT(*) AS count FROM clients WHERE tenant_id = ? AND active = 1").get(tenant.id)).count || 0),
      invoices: Number((await db.prepare("SELECT COUNT(*) AS count FROM billing_invoices WHERE tenant_id = ?").get(tenant.id)).count || 0),
      openBalance: Number((await db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM billing_invoices WHERE tenant_id = ? AND status IN ('draft', 'open', 'uncollectible')").get(tenant.id)).total || 0),
      paidRevenue: Number((await db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM billing_invoices WHERE tenant_id = ? AND status = 'paid'").get(tenant.id)).total || 0),
      recentInvoices: invoiceRows,
      domains: await tenantDomains(tenant.id),
    };
  }));
}

async function assertTenantCanWrite(tenantId, feature = "write") {
  const billing = await tenantBilling(tenantId);
  if (["suspended", "cancelled", "past_due"].includes(billing.status)) {
    const error = new Error(`Subscription status blocks ${feature}.`);
    error.status = 402;
    throw error;
  }
  return billing;
}

async function runAutomaticBilling(runDate = todayIso()) {
  const cycle = billingCycleKey(runDate);
  const subscriptions = await db.prepare(`
    SELECT s.id, s.tenant_id AS tenantId, s.plan, s.status, COALESCE(s.billing_day, 1) AS billingDay,
           COALESCE(s.auto_billing_enabled, 0) AS autoBillingEnabled
    FROM subscriptions s
    JOIN tenants t ON t.id = s.tenant_id
    WHERE s.id = (SELECT id FROM subscriptions WHERE tenant_id = s.tenant_id ORDER BY id DESC LIMIT 1)
      AND COALESCE(s.auto_billing_enabled, 0) = 1
      AND s.status = 'active'
      AND t.status <> 'cancelled'
  `).all();
  const created = [];
  const skipped = [];
  for (const subscription of subscriptions) {
    const billingDate = billingDateForMonth(runDate, subscription.billingDay);
    if (runDate < billingDate) {
      skipped.push({ tenantId: subscription.tenantId, reason: "not_due", billingDate });
      continue;
    }
    const existing = await db.prepare("SELECT id FROM billing_invoices WHERE tenant_id = ? AND billing_cycle = ?").get(subscription.tenantId, cycle);
    if (existing) {
      skipped.push({ tenantId: subscription.tenantId, reason: "exists", invoiceId: existing.id });
      continue;
    }
    const catalogItem = planCatalog[subscription.plan] || planCatalog.starter;
    const amount = Number(catalogItem.monthlyPrice || 0);
    const periodStart = billingDate;
    const periodEnd = addMonthsIso(periodStart, 1);
    const dueAt = addDaysIso(periodStart, 14);
    const invoiceNumber = `CLN-${new Date().getUTCFullYear()}-${String(Date.now()).slice(-8)}-${subscription.tenantId}`;
    const result = await db.prepare(`
      INSERT INTO billing_invoices (tenant_id, subscription_id, number, status, currency, amount, period_start, period_end, due_at, notes, billing_cycle)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(subscription.tenantId, subscription.id, invoiceNumber, "open", "USD", amount, periodStart, periodEnd, dueAt, "Auto monthly billing", cycle);
    await db.prepare("UPDATE subscriptions SET current_period_end = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(periodEnd, subscription.id);
    created.push({ tenantId: subscription.tenantId, invoiceId: result.lastInsertRowid, invoiceNumber, amount, cycle });
  }
  return { runDate, cycle, created, skipped };
}

async function serviceMap() {
  return new Map((await db.prepare("SELECT id, duration FROM services").all()).map((row) => [row.id, row]));
}

async function appointmentConflict({ id, tenantId, date, time, serviceId, therapistId }) {
  const service = await db.prepare("SELECT duration, category_id, name FROM services WHERE id = ? AND tenant_id = ?").get(serviceId, tenantId);
  if (!service) return null;
  const start = toMinutes(time);
  const end = start + service.duration;
  const rows = await db.prepare(`
    SELECT a.*, s.duration, s.name AS service_name, c.fname, c.lname
    FROM appointments a
    JOIN services s ON s.id = a.service_id
    JOIN clients c ON c.id = a.client_id
    WHERE a.tenant_id = ? AND a.date = ? AND a.status != 'cancelled' AND a.active = 1 AND s.category_id = ? AND a.id != ?
  `).all(tenantId, date, service.category_id, id || 0);
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
    ? await db.prepare(`${base} WHERE a.tenant_id = ? AND a.active = 1 AND a.therapist_id = ? ORDER BY a.date DESC, a.time DESC`).all(user.tenantId, user.id)
    : await db.prepare(`${base} WHERE a.tenant_id = ? AND a.active = 1 ORDER BY a.date DESC, a.time DESC`).all(user.tenantId);
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
    ? await db.prepare("SELECT * FROM clients WHERE tenant_id = ? AND active = 1 AND therapist_id = ? ORDER BY updated_at DESC").all(user.tenantId, user.id)
    : await db.prepare("SELECT * FROM clients WHERE tenant_id = ? AND active = 1 ORDER BY updated_at DESC").all(user.tenantId);
  return rows.map((row) => ({
    id: row.id,
    fname: row.fname,
    lname: row.lname,
    phone: row.phone,
    email: row.email,
    therapistId: row.therapist_id,
    stage: row.stage || "lead",
    source: row.source || "",
    tags: jsonArray(row.tags),
    lastContactedAt: row.last_contacted_at || "",
    notes: row.notes,
  }));
}

async function listCrmTasks(user) {
  const rows = await db.prepare(`
    SELECT t.id, t.client_id AS clientId, t.assigned_to AS assignedTo, t.type, t.title,
           t.due_date AS dueDate, t.status, t.priority, t.notes, t.completed_at AS completedAt,
           t.created_at AS createdAt, c.fname || ' ' || c.lname AS clientName, c.phone AS clientPhone,
           u.name AS assignedToName
    FROM crm_tasks t
    JOIN clients c ON c.id = t.client_id
    LEFT JOIN users u ON u.id = t.assigned_to
    WHERE t.tenant_id = ? AND c.active = 1
    ORDER BY CASE t.status WHEN 'open' THEN 0 ELSE 1 END, COALESCE(t.due_date, '9999-12-31'), t.id DESC
    LIMIT 150
  `).all(user.tenantId);
  if (user.role !== "therapist") return rows;
  return rows.filter((row) => Number(row.assignedTo || 0) === Number(user.id));
}

async function listCrmEvents(tenantId = 1, clientId = null) {
  const where = clientId ? "WHERE e.tenant_id = ? AND e.client_id = ?" : "WHERE e.tenant_id = ?";
  const args = clientId ? [tenantId, clientId] : [tenantId];
  return await db.prepare(`
    SELECT e.id, e.client_id AS clientId, e.user_id AS userId, e.type, e.description,
           e.created_at AS createdAt, c.fname || ' ' || c.lname AS clientName, u.name AS userName
    FROM crm_events e
    LEFT JOIN clients c ON c.id = e.client_id
    LEFT JOIN users u ON u.id = e.user_id
    ${where}
    ORDER BY e.id DESC
    LIMIT 100
  `).all(...args);
}

async function addCrmEvent({ tenantId, clientId, userId, type, description }) {
  await db.prepare("INSERT INTO crm_events (tenant_id, client_id, user_id, type, description) VALUES (?, ?, ?, ?, ?)")
    .run(tenantId, clientId || null, userId || null, type, description);
}

async function clinicSettings(tenantId = 1) {
  const rows = await db.prepare("SELECT key, value FROM clinic_settings WHERE tenant_id = ? ORDER BY key").all(tenantId);
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

async function updateClinicSettings(values, tenantId = 1) {
  const allowed = [
    "clinicName",
    "logoUrl",
    "currency",
    "workStart",
    "workEnd",
    "workDays",
    "whatsappTemplate",
    "whatsappEnabled",
    "whatsappMode",
    "whatsappBusinessPhone",
    "whatsappFeedbackTemplate",
    "whatsappGiftTemplate",
  ];
  const stmt = await db.prepare(`
    INSERT INTO clinic_settings (tenant_id, key, value, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(values, key)) stmt.run(tenantId, key, String(values[key] ?? ""));
  }
}

async function listMessageLogs(tenantId = 1) {
  return await db.prepare(`
    SELECT id, channel, entity, entity_id AS entityId, recipient, message, status,
           provider_message_id AS providerMessageId, fallback_url AS fallbackUrl, error,
           created_at AS createdAt
    FROM message_logs
    WHERE tenant_id = ?
    ORDER BY id DESC
    LIMIT 100
  `).all(tenantId);
}

async function logMessage({ tenantId, userId, entity, entityId, recipient, message, result = {}, error = "" }) {
  const status = error ? "failed" : result.dryRun ? "dry_run" : result.ok ? "sent" : "fallback";
  await db.prepare(`
    INSERT INTO message_logs (tenant_id, user_id, channel, entity, entity_id, recipient, message, status, provider_message_id, fallback_url, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    tenantId,
    userId || null,
    "whatsapp",
    entity,
    entityId || null,
    recipient || "",
    message || "",
    status,
    result.messageId || "",
    result.fallbackUrl || "",
    error || "",
  );
  return status;
}

async function sendTenantWhatsApp({ user, entity, entityId, to, message }) {
  const billing = await tenantBilling(user.tenantId);
  const settings = await clinicSettings(user.tenantId);
  const fallbackUrl = whatsappFallbackUrl(to, message);
  if (!billing.limits.whatsapp || settings.whatsappEnabled !== "true" || settings.whatsappMode === "fallback") {
    const result = { ok: false, configured: false, fallbackUrl, message: "WhatsApp is in fallback mode for this tenant." };
    await logMessage({ tenantId: user.tenantId, userId: user.id, entity, entityId, recipient: to, message, result });
    return result;
  }
  try {
    const result = await sendWhatsAppText({ to, message });
    const finalResult = { ...result, fallbackUrl: result.fallbackUrl || fallbackUrl };
    await logMessage({ tenantId: user.tenantId, userId: user.id, entity, entityId, recipient: to, message, result: finalResult });
    return finalResult;
  } catch (error) {
    await logMessage({ tenantId: user.tenantId, userId: user.id, entity, entityId, recipient: to, message, result: { fallbackUrl }, error: error.message });
    throw error;
  }
}

async function consentTemplates(tenantId = 1) {
  return await db.prepare(`
    SELECT t.id, t.category_id AS categoryId, t.title, t.url, t.original_name AS originalName,
           t.mime_type AS mimeType, t.size, t.created_at AS createdAt, c.name AS categoryName
    FROM consent_templates t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.tenant_id = ? AND t.active = 1
    ORDER BY t.id DESC
  `).all(tenantId);
}

async function consentTemplateById(id, tenantId = 1) {
  return await db.prepare(`
    SELECT id, category_id AS categoryId, title, url, original_name AS originalName, mime_type AS mimeType, size, path, active
    FROM consent_templates
    WHERE id = ? AND tenant_id = ? AND active = 1
  `).get(id, tenantId);
}

async function consentSignatures(tenantId = 1) {
  return await db.prepare(`
    SELECT s.id, s.template_id AS templateId, s.client_id AS clientId, s.appointment_id AS appointmentId,
           s.signer_name AS signerName, s.signed_at AS signedAt, t.title AS templateTitle,
           c.fname || ' ' || c.lname AS clientName
    FROM consent_signatures s
    JOIN consent_templates t ON t.id = s.template_id
    LEFT JOIN clients c ON c.id = s.client_id
    WHERE s.tenant_id = ?
    ORDER BY s.id DESC
    LIMIT 100
  `).all(tenantId);
}

function pdfSafeText(value) {
  return String(value ?? "")
    .slice(0, 120);
}

function consentPdfLabels(lang = "he") {
  if (lang === "ar") {
    return {
      title: "״¥‚״±״§״± ‚״§†ˆ† …ˆ‚‘״¹",
      form: "״§„†…ˆ״°״¬",
      client: "״§„״¹…„",
      signer: "״§„…ˆ‚‘״¹",
      appointment: "״§„…ˆ״¹״¯",
      signedAt: "ˆ‚״× ״§„״×ˆ‚״¹",
      signatureStamp: "״®״×… ״§„״×ˆ‚״¹",
      displayName: "״¥‚״±״§״± …ˆ‚‘״¹",
      notes: "״¥‚״±״§״± ‚״§†ˆ† …ˆ‚‘״¹",
    };
  }
  return {
    title: "׳˜׳•׳₪׳¡ ׳׳©׳₪׳˜׳™ ׳—׳×׳•׳",
    form: "׳—׳×׳™׳׳”",
    client: "׳׳§׳•׳—",
    signer: "׳—׳•׳×׳",
    appointment: "׳×׳•׳¨",
    signedAt: "׳ ׳—׳×׳ ׳‘׳×׳׳¨׳™׳",
    signatureStamp: "׳—׳•׳×׳׳× ׳—׳×׳™׳׳”",
    displayName: "׳˜׳•׳₪׳¡ ׳—׳×׳•׳",
    notes: "׳˜׳•׳₪׳¡ ׳׳©׳₪׳˜׳™ ׳—׳×׳•׳",
  };
}

async function missingLegalConsents({ tenantId, clientId, appointmentId, serviceId }) {
  const service = await db.prepare("SELECT category_id FROM services WHERE id = ? AND tenant_id = ?").get(serviceId, tenantId);
  if (!service?.category_id) return [];
  const templates = await db.prepare(`
    SELECT id, title
    FROM consent_templates
    WHERE tenant_id = ? AND active = 1 AND category_id = ?
    ORDER BY id
  `).all(tenantId, service.category_id);
  const missing = [];
  for (const template of templates) {
    const signature = await db.prepare(`
      SELECT id
      FROM consent_signatures
      WHERE tenant_id = ? AND template_id = ? AND (client_id = ? OR appointment_id = ?)
      LIMIT 1
    `).get(tenantId, template.id, clientId || 0, appointmentId || 0);
    if (!signature) missing.push(template);
  }
  return missing;
}

async function createSignedConsentClientFile({ signatureId, tenantId, templateId, clientId, appointmentId, signerName, signatureData, lang = "he" }) {
  if (!clientId) return null;
  const template = await consentTemplateById(templateId, tenantId);
  const client = await db.prepare("SELECT fname, lname FROM clients WHERE id = ? AND tenant_id = ?").get(clientId, tenantId);
  if (!template || !client || !template.path || !existsSync(template.path)) return null;

  const clientDir = resolve(config.uploads.dir, "clients", String(clientId), "consents");
  mkdirSync(clientDir, { recursive: true });
  const fileName = `signed-consent-${signatureId}.pdf`;
  const target = resolve(clientDir, fileName);
  const signedAt = new Date().toISOString().slice(0, 19).replace("T", " ");

  const labels = consentPdfLabels(lang);
  const pdf = await PDFDocument.load(readFileSync(template.path));
  pdf.registerFontkit(fontkit);
  const fontPath = existsSync("C:\\Windows\\Fonts\\arial.ttf") ? "C:\\Windows\\Fonts\\arial.ttf" : "C:\\Windows\\Fonts\\Arial.ttf";
  const font = await pdf.embedFont(readFileSync(fontPath), { subset: true });
  const page = pdf.addPage();
  const { width, height } = page.getSize();
  page.drawText(labels.title, { x: 48, y: height - 70, size: 20, font, color: rgb(0.18, 0.42, 0.31) });
  page.drawText(`${labels.form}: ${pdfSafeText(template.title)}`, { x: 48, y: height - 110, size: 12, font });
  page.drawText(`${labels.client}: ${pdfSafeText(`${client.fname} ${client.lname}`)}`, { x: 48, y: height - 132, size: 12, font });
  page.drawText(`${labels.signer}: ${pdfSafeText(signerName)}`, { x: 48, y: height - 154, size: 12, font });
  page.drawText(`${labels.appointment}: ${appointmentId || "-"}`, { x: 48, y: height - 176, size: 12, font });
  page.drawText(`${labels.signedAt}: ${signedAt}`, { x: 48, y: height - 198, size: 12, font });
  page.drawRectangle({ x: 48, y: height - 385, width: width - 96, height: 145, borderColor: rgb(0.18, 0.42, 0.31), borderWidth: 1 });
  page.drawText(labels.signatureStamp, { x: 60, y: height - 260, size: 11, font, color: rgb(0.42, 0.55, 0.48) });

  const signatureBytes = Buffer.from(String(signatureData).split(",")[1] || "", "base64");
  if (signatureBytes.length) {
    const image = await pdf.embedPng(signatureBytes);
    const scaled = image.scaleToFit(width - 130, 105);
    page.drawImage(image, { x: 65, y: height - 370, width: scaled.width, height: scaled.height });
  }

  const stampedBytes = await pdf.save();
  writeFileSync(target, stampedBytes);

  const displayName = `${labels.displayName} - ${template.title}`;
  const result = await db.prepare("INSERT INTO client_files (tenant_id, client_id, name, url, original_name, mime_type, size, path, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(tenantId, clientId, displayName, "", fileName, "application/pdf", stampedBytes.length, target, labels.notes);
  const downloadUrl = `/api/client-files/${result.lastInsertRowid}/download`;
  await db.prepare("UPDATE client_files SET url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(downloadUrl, result.lastInsertRowid);
  return result.lastInsertRowid;
}

async function feedbackRequests(tenantId = 1) {
  return await db.prepare(`
    SELECT f.id, f.appointment_id AS appointmentId, f.token, f.rating, f.comment, f.status,
           f.sent_at AS sentAt, f.submitted_at AS submittedAt,
           c.fname || ' ' || c.lname AS clientName, c.phone AS clientPhone,
           s.name AS serviceName, a.date, a.time
    FROM feedback_requests f
    JOIN appointments a ON a.id = f.appointment_id
    JOIN clients c ON c.id = a.client_id
    JOIN services s ON s.id = a.service_id
    WHERE f.tenant_id = ?
    ORDER BY f.id DESC
    LIMIT 120
  `).all(tenantId);
}

async function giftCards(tenantId = 1) {
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
    WHERE g.tenant_id = ?
    ORDER BY g.id DESC
  `).all(tenantId);
}

async function clientFiles(clientId, tenantId = 1) {
  return await db.prepare(`
    SELECT id, client_id AS clientId, name, url, original_name AS originalName, mime_type AS mimeType, size, notes, created_at AS createdAt
    FROM client_files
    WHERE tenant_id = ? AND active = 1 AND client_id = ?
    ORDER BY id DESC
  `).all(tenantId, clientId);
}

async function clientFileById(id, tenantId = 1) {
  return await db.prepare(`
    SELECT id, client_id AS clientId, name, url, original_name AS originalName, mime_type AS mimeType, size, path, notes, active
    FROM client_files
    WHERE id = ? AND tenant_id = ? AND active = 1
  `).get(id, tenantId);
}

async function canSeeClient(user, clientId) {
  if (user.role !== "therapist") {
    const row = await db.prepare("SELECT id FROM clients WHERE id = ? AND tenant_id = ? AND active = 1").get(clientId, user.tenantId);
    return Boolean(row);
  }
  const row = await db.prepare("SELECT id FROM clients WHERE id = ? AND tenant_id = ? AND active = 1 AND therapist_id = ?").get(clientId, user.tenantId, user.id);
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

  // LEGACY FALLBACK - STATUS/ACCOUNT - SAFE TO REMOVE AFTER VALIDATION
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
      name: "Clinova",
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

  // LEGACY FALLBACK - SIGNUP GUARD - SAFE TO REMOVE AFTER VALIDATION
  if (method === "POST" && url.pathname === "/api/signup") {
    return json(res, 403, { error: "Clinic creation is managed by the platform owner." });
  }

  if (method === "GET" && url.pathname.startsWith("/api/invitations/")) {
    const token = url.pathname.split("/").pop();
    const invitation = await db.prepare(`
      SELECT i.id, i.email, i.name, i.role, i.expires_at AS expiresAt, i.accepted_at AS acceptedAt,
             t.name AS clinicName, t.slug AS tenantSlug
      FROM user_invitations i
      JOIN tenants t ON t.id = i.tenant_id
      WHERE i.token = ?
      LIMIT 1
    `).get(token);
    if (!invitation) return json(res, 404, { error: "Invitation not found." });
    if (invitation.acceptedAt) return json(res, 410, { error: "Invitation was already accepted." });
    if (Number(invitation.expiresAt) < Date.now()) return json(res, 410, { error: "Invitation expired." });
    return json(res, 200, { invitation });
  }

  if (method === "POST" && url.pathname.startsWith("/api/invitations/") && url.pathname.endsWith("/accept")) {
    const token = url.pathname.split("/")[3];
    const body = await readBody(req);
    if (!body.password || String(body.password).length < 8) return json(res, 400, { error: "Password must be at least 8 characters." });
    const invitation = await db.prepare("SELECT * FROM user_invitations WHERE token = ? LIMIT 1").get(token);
    if (!invitation) return json(res, 404, { error: "Invitation not found." });
    if (invitation.accepted_at) return json(res, 410, { error: "Invitation was already accepted." });
    if (Number(invitation.expires_at) < Date.now()) return json(res, 410, { error: "Invitation expired." });
    const email = normalizeEmail(invitation.email);
    const existing = await db.prepare("SELECT id FROM users WHERE tenant_id = ? AND (lower(email) = ? OR lower(username) = ?)").get(invitation.tenant_id, email, email);
    if (existing) return json(res, 409, { error: "A user with this email already exists." });
    const result = await db.prepare(`
      INSERT INTO users (tenant_id, username, email, password_hash, name, title, role, workdays, service_ids, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(invitation.tenant_id, email, email, hashPassword(body.password), invitation.name, "", invitation.role, "[]", "[]", 1);
    await db.prepare("UPDATE user_invitations SET accepted_at = CURRENT_TIMESTAMP WHERE id = ?").run(invitation.id);
    const row = await db.prepare("SELECT * FROM users WHERE id = ? AND tenant_id = ?").get(result.lastInsertRowid, invitation.tenant_id);
    const sessionToken = createSessionToken(config.sessionSecret);
    const sessionId = sessionToken.split(".")[0];
    const expiresAt = Date.now() + 1000 * 60 * 60 * 12;
    await db.prepare("INSERT INTO sessions (id, tenant_id, user_id, expires_at) VALUES (?, ?, ?, ?)")
      .run(sessionId, invitation.tenant_id, row.id, expiresAt);
    setSessionCookie(res, sessionToken, expiresAt);
    await audit(row.id, "accept_invitation", "users", row.id, { tenantId: invitation.tenant_id, invitationId: invitation.id });
    return json(res, 201, { user: rowToUser(row) });
  }

  if (method === "POST" && url.pathname === "/api/login") {
    const body = await readBody(req);
    const identifier = String(body.identifier || body.email || body.username || "").trim();
    if (isLoginBlocked(req, identifier)) {
      json(res, 429, { error: "…״­״§ˆ„״§״× ״¯״®ˆ„ ƒ״«״±״©. ״­״§ˆ„ …״±״© ״£״®״±‰ ״¨״¹״¯ 15 ״¯‚‚״©" });
      return;
    }
    const row = await findLoginUser(identifier, body.tenantSlug || body.tenant || "");
    if (!row || !verifyPassword(body.password || "", row.password_hash)) {
      recordFailedLogin(req, identifier);
      json(res, 401, { error: "״§״³… ״§„…״³״×״®״¯… ״£ˆ ƒ„…״© ״§„…״±ˆ״± ״÷״± ״µ״­״­״©" });
      return;
    }
    clearFailedLogin(req, identifier);
    const token = createSessionToken(config.sessionSecret);
    const id = token.split(".")[0];
    const expiresAt = Date.now() + 1000 * 60 * 60 * 12;
    await db.prepare("INSERT INTO sessions (id, tenant_id, user_id, expires_at) VALUES (?, ?, ?, ?)").run(id, row.tenant_id || 1, row.id, expiresAt);
    setSessionCookie(res, token, expiresAt);
    await audit(row.id, "login", "session", null, { tenantId: row.tenant_id || 1 });
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

  // LEGACY FALLBACK - STATUS/ACCOUNT - SAFE TO REMOVE AFTER VALIDATION
  if (method === "POST" && url.pathname === "/api/account/password") {
    const user = await requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    if (!body.newPassword || String(body.newPassword).length < 8) {
      json(res, 400, { error: "ƒ„…״© ״§„…״±ˆ״± ״§„״¬״¯״¯״© ״¬״¨ ״£† ״×ƒˆ† 8 ״£״­״± ״¹„‰ ״§„״£‚„" });
      return;
    }
    const row = await db.prepare("SELECT * FROM users WHERE id = ? AND tenant_id = ?").get(user.id, user.tenantId);
    if (!row || !verifyPassword(body.currentPassword || "", row.password_hash)) {
      json(res, 400, { error: "ƒ„…״© ״§„…״±ˆ״± ״§„״­״§„״© ״÷״± ״µ״­״­״©" });
      return;
    }
    await db.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?")
      .run(hashPassword(body.newPassword), user.id, user.tenantId);
    await db.prepare("DELETE FROM sessions WHERE user_id = ? AND tenant_id = ?").run(user.id, user.tenantId);
    clearSessionCookie(res);
    await audit(user.id, "change_password", "users", user.id, { tenantId: user.tenantId });
    json(res, 200, { ok: true });
    return;
  }

  if (method === "GET" && url.pathname === "/api/me") {
    const user = await currentUser(req);
    json(res, 200, { user });
    return;
  }

  if (method === "GET" && url.pathname === "/api/invitations") {
    const user = await requirePermission(req, res, "users");
    if (!user) return;
    const rows = await db.prepare(`
      SELECT i.id, i.email, i.name, i.role, i.token, i.expires_at AS expiresAt, i.accepted_at AS acceptedAt,
             i.created_at AS createdAt, u.name AS invitedByName
      FROM user_invitations i
      LEFT JOIN users u ON u.id = i.invited_by AND u.tenant_id = i.tenant_id
      WHERE i.tenant_id = ?
      ORDER BY i.id DESC
      LIMIT 50
    `).all(user.tenantId);
    json(res, 200, { invitations: rows.map((row) => ({ ...row, inviteUrl: inviteUrl(req, row.token) })) });
    return;
  }

  if (method === "GET" && url.pathname === "/api/billing") {
    const user = await requirePlatformOwner(req, res);
    if (!user) return;
    json(res, 200, { billing: await tenantBilling(user.tenantId) });
    return;
  }

  if (method === "PUT" && url.pathname === "/api/billing") {
    const user = await requirePlatformOwner(req, res);
    if (!user) return;
    const body = await readBody(req);
    const plan = planCatalog[body.plan] ? body.plan : "";
    const status = ["trial", "active", "past_due", "suspended", "cancelled"].includes(body.status) ? body.status : "";
    if (!plan || !status) return json(res, 400, { error: "Valid plan and status are required." });
    const currentPeriodEnd = body.currentPeriodEnd || null;
    const existing = await db.prepare("SELECT id FROM subscriptions WHERE tenant_id = ? ORDER BY id DESC LIMIT 1").get(user.tenantId);
    if (existing) {
      await db.prepare("UPDATE subscriptions SET plan = ?, status = ?, current_period_end = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?")
        .run(plan, status, currentPeriodEnd, existing.id, user.tenantId);
    } else {
      await db.prepare("INSERT INTO subscriptions (tenant_id, provider, status, plan, current_period_end) VALUES (?, ?, ?, ?, ?)")
        .run(user.tenantId, "manual", status, plan, currentPeriodEnd);
    }
    await db.prepare("UPDATE tenants SET plan = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(plan, status, user.tenantId);
    await audit(user.id, "update_billing", "subscriptions", existing?.id || null, { tenantId: user.tenantId, plan, status });
    json(res, 200, { billing: await tenantBilling(user.tenantId) });
    return;
  }

  if (method === "POST" && url.pathname === "/api/billing/invoices") {
    const user = await requirePlatformOwner(req, res);
    if (!user) return;
    const body = await readBody(req);
    const billing = await tenantBilling(user.tenantId);
    const plan = planCatalog[body.plan] ? body.plan : billing.plan || "starter";
    const catalogItem = planCatalog[plan] || planCatalog.starter;
    const periodStart = body.periodStart || todayIso();
    const periodEnd = body.periodEnd || addDaysIso(periodStart, 30);
    const dueAt = body.dueAt || addDaysIso(periodStart, 14);
    const amount = Math.max(0, Number(body.amount || catalogItem.monthlyPrice || 0));
    const currency = String(body.currency || "USD").trim().toUpperCase().slice(0, 3) || "USD";
    const invoiceNumber = `CLN-${new Date().getUTCFullYear()}-${String(Date.now()).slice(-8)}`;
    const result = await db.prepare(`
      INSERT INTO billing_invoices (tenant_id, subscription_id, number, status, currency, amount, period_start, period_end, due_at, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(user.tenantId, billing.subscription?.id || null, invoiceNumber, body.status === "draft" ? "draft" : "open", currency, amount, periodStart, periodEnd, dueAt, String(body.notes || ""));
    await audit(user.id, "create_invoice", "billing_invoices", result.lastInsertRowid, { tenantId: user.tenantId, invoiceNumber, amount, currency });
    json(res, 201, { billing: await tenantBilling(user.tenantId), invoiceId: result.lastInsertRowid });
    return;
  }

  if (method === "PUT" && url.pathname.startsWith("/api/billing/invoices/")) {
    const user = await requirePlatformOwner(req, res);
    if (!user) return;
    const invoiceId = Number(url.pathname.split("/").pop());
    const body = await readBody(req);
    const status = ["draft", "open", "paid", "void", "uncollectible"].includes(body.status) ? body.status : "";
    if (!invoiceId || !status) return json(res, 400, { error: "Valid invoice and status are required." });
    const invoice = await db.prepare("SELECT id FROM billing_invoices WHERE id = ? AND tenant_id = ?").get(invoiceId, user.tenantId);
    if (!invoice) return json(res, 404, { error: "Invoice not found" });
    await db.prepare(`
      UPDATE billing_invoices
      SET status = ?, paid_at = CASE WHEN ? = 'paid' THEN CURRENT_TIMESTAMP ELSE paid_at END, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ?
    `).run(status, status, invoiceId, user.tenantId);
    await audit(user.id, "update_invoice", "billing_invoices", invoiceId, { tenantId: user.tenantId, status });
    json(res, 200, { billing: await tenantBilling(user.tenantId) });
    return;
  }

  if (method === "POST" && url.pathname === "/api/invitations") {
    const user = await requirePermission(req, res, "users");
    if (!user) return;
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    const name = String(body.name || "").trim();
    const role = ["admin", "reception", "therapist"].includes(body.role) ? body.role : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: "Valid email is required." });
    if (name.length < 2) return json(res, 400, { error: "Name is required." });
    if (!role) return json(res, 400, { error: "Valid role is required." });
    const billing = await assertTenantCanWrite(user.tenantId, "team invitations");
    if (limitReached(billing.usage.users, billing.limits.maxUsers)) return json(res, 402, { error: `Plan user limit reached (${billing.limits.maxUsers}).` });
    const existing = await db.prepare("SELECT id FROM users WHERE tenant_id = ? AND (lower(email) = ? OR lower(username) = ?)").get(user.tenantId, email, email);
    if (existing) return json(res, 409, { error: "A user with this email already exists." });
    await db.prepare("UPDATE user_invitations SET accepted_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND lower(email) = ? AND accepted_at IS NULL").run(user.tenantId, email);
    const token = `${randomUUID()}${randomUUID()}`.replace(/-/g, "");
    const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7;
    const result = await db.prepare(`
      INSERT INTO user_invitations (tenant_id, email, name, role, token, invited_by, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(user.tenantId, email, name, role, token, user.id, expiresAt);
    await audit(user.id, "invite_user", "user_invitations", result.lastInsertRowid, { tenantId: user.tenantId, email, role });
    json(res, 201, { id: result.lastInsertRowid, inviteUrl: inviteUrl(req, token), token, expiresAt });
    return;
  }

  if (method === "DELETE" && url.pathname.startsWith("/api/invitations/")) {
    const user = await requirePermission(req, res, "users");
    if (!user) return;
    const invitationId = Number(url.pathname.split("/").pop());
    await db.prepare("UPDATE user_invitations SET accepted_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ? AND accepted_at IS NULL").run(invitationId, user.tenantId);
    await audit(user.id, "revoke_invitation", "user_invitations", invitationId, { tenantId: user.tenantId });
    json(res, 200, { ok: true });
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
      ? "SELECT c.*, u.name AS therapistName FROM clients c LEFT JOIN users u ON u.id = c.therapist_id WHERE c.tenant_id = ? AND c.active = 1 AND c.therapist_id = ? ORDER BY c.updated_at DESC LIMIT 80"
      : "SELECT c.*, u.name AS therapistName FROM clients c LEFT JOIN users u ON u.id = c.therapist_id WHERE c.tenant_id = ? AND c.active = 1 ORDER BY c.updated_at DESC LIMIT 120";
    const clientRows = user.role === "therapist" ? await db.prepare(clientSql).all(user.tenantId, user.id) : await db.prepare(clientSql).all(user.tenantId);
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
      WHERE a.tenant_id = ? AND a.active = 1 AND (c.fname LIKE ? OR c.lname LIKE ? OR c.phone LIKE ? OR REPLACE(c.phone, '-', '') LIKE ? OR s.name LIKE ? OR u.name LIKE ? OR a.date LIKE ? OR a.status LIKE ? OR a.payment_status LIKE ?)
    `;
    const apptRows = user.role === "therapist"
      ? await db.prepare(`${apptBase} AND a.therapist_id = ? ORDER BY a.date DESC, a.time DESC LIMIT 10`).all(user.tenantId, like, like, like, digitTerm, like, like, like, like, like, user.id)
      : await db.prepare(`${apptBase} ORDER BY a.date DESC, a.time DESC LIMIT 10`).all(user.tenantId, like, like, like, digitTerm, like, like, like, like, like);
    const serviceRows = user.role === "admin" || user.role === "reception"
      ? await db.prepare("SELECT s.id, s.name, s.duration, s.price, c.name AS categoryName FROM services s JOIN categories c ON c.id = s.category_id WHERE s.tenant_id = ? AND s.active = 1 AND (s.name LIKE ? OR c.name LIKE ?) ORDER BY s.name LIMIT 8").all(user.tenantId, like, like)
      : [];
    json(res, 200, { clients, appointments: apptRows, services: serviceRows });
    return;
  }

  if (method === "GET" && url.pathname === "/api/message-logs") {
    const user = await requirePermission(req, res, "feedback");
    if (!user) return;
    json(res, 200, { messageLogs: await listMessageLogs(user.tenantId) });
    return;
  }

  if (method === "GET" && url.pathname === "/api/crm") {
    const user = await requirePermission(req, res, "crm");
    if (!user) return;
    json(res, 200, { tasks: await listCrmTasks(user), events: await listCrmEvents(user.tenantId) });
    return;
  }

  // LEGACY FALLBACK - PLATFORM TENANTS READ - SAFE TO REMOVE AFTER VALIDATION
  if (method === "GET" && url.pathname === "/api/platform/tenants") {
    const user = await requirePlatformOwner(req, res);
    if (!user) return;
    json(res, 200, { tenants: await platformTenants() });
    return;
  }

  // LEGACY FALLBACK - PLATFORM TENANT CREATION - SAFE TO REMOVE AFTER VALIDATION
  if (method === "POST" && url.pathname === "/api/platform/tenants") {
    const user = await requirePlatformOwner(req, res);
    if (!user) return;
    const body = await readBody(req);
    const result = await provisionTenant({
      clinicName: body.clinicName,
      slug: body.slug,
      ownerName: body.ownerName,
      email: body.email,
      password: body.password,
    });
    const plan = planCatalog[body.plan] ? body.plan : "starter";
    const status = ["trial", "active", "past_due", "suspended", "cancelled"].includes(body.status) ? body.status : "trial";
    await db.prepare("UPDATE subscriptions SET plan = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ?")
      .run(plan, status, result.tenant.id);
    await db.prepare("UPDATE tenants SET plan = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(plan, status, result.tenant.id);
    await audit(user.id, "platform_create_tenant", "tenants", result.tenant.id, { tenantId: user.tenantId, targetTenantId: result.tenant.id, plan, status });
    json(res, 201, { tenants: await platformTenants(), tenant: result.tenant });
    return;
  }

  // LEGACY FALLBACK - PLATFORM INVOICES - SAFE TO REMOVE AFTER VALIDATION
  if (method === "POST" && url.pathname.match(/^\/api\/platform\/tenants\/\d+\/invoices$/)) {
    const user = await requirePlatformOwner(req, res);
    if (!user) return;
    const tenantId = Number(url.pathname.split("/")[4]);
    const body = await readBody(req);
    const tenant = await db.prepare("SELECT id FROM tenants WHERE id = ?").get(tenantId);
    if (!tenant) return json(res, 404, { error: "Tenant not found" });
    const billing = await tenantBilling(tenantId);
    const plan = planCatalog[body.plan] ? body.plan : billing.plan || "starter";
    const catalogItem = planCatalog[plan] || planCatalog.starter;
    const periodStart = body.periodStart || todayIso();
    const periodEnd = body.periodEnd || addDaysIso(periodStart, 30);
    const dueAt = body.dueAt || addDaysIso(periodStart, 14);
    const amount = Math.max(0, Number(body.amount || catalogItem.monthlyPrice || 0));
    const currency = String(body.currency || "USD").trim().toUpperCase().slice(0, 3) || "USD";
    const invoiceNumber = `CLN-${new Date().getUTCFullYear()}-${String(Date.now()).slice(-8)}`;
    const result = await db.prepare(`
      INSERT INTO billing_invoices (tenant_id, subscription_id, number, status, currency, amount, period_start, period_end, due_at, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(tenantId, billing.subscription?.id || null, invoiceNumber, body.status === "draft" ? "draft" : "open", currency, amount, periodStart, periodEnd, dueAt, String(body.notes || ""));
    await audit(user.id, "platform_create_invoice", "billing_invoices", result.lastInsertRowid, { tenantId: user.tenantId, targetTenantId: tenantId, invoiceNumber, amount, currency });
    json(res, 201, { tenants: await platformTenants(), invoiceId: result.lastInsertRowid });
    return;
  }

  // LEGACY FALLBACK - PLATFORM INVOICES - SAFE TO REMOVE AFTER VALIDATION
  if (method === "PUT" && url.pathname.startsWith("/api/platform/invoices/")) {
    const user = await requirePlatformOwner(req, res);
    if (!user) return;
    const invoiceId = Number(url.pathname.split("/").pop());
    const body = await readBody(req);
    const status = ["draft", "open", "paid", "void", "uncollectible"].includes(body.status) ? body.status : "";
    if (!invoiceId || !status) return json(res, 400, { error: "Valid invoice and status are required." });
    const invoice = await db.prepare("SELECT id, tenant_id AS tenantId FROM billing_invoices WHERE id = ?").get(invoiceId);
    if (!invoice) return json(res, 404, { error: "Invoice not found" });
    await db.prepare(`
      UPDATE billing_invoices
      SET status = ?, paid_at = CASE WHEN ? = 'paid' THEN CURRENT_TIMESTAMP ELSE paid_at END, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, status, invoiceId);
    await audit(user.id, "platform_update_invoice", "billing_invoices", invoiceId, { tenantId: user.tenantId, targetTenantId: invoice.tenantId, status });
    json(res, 200, { tenants: await platformTenants() });
    return;
  }

  // LEGACY FALLBACK - PLATFORM AUTO BILLING - SAFE TO REMOVE AFTER VALIDATION
  if (method === "POST" && url.pathname === "/api/platform/billing/auto-run") {
    const user = await requirePlatformOwner(req, res);
    if (!user) return;
    const body = await readBody(req);
    const runDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.runDate || "")) ? String(body.runDate) : todayIso();
    const result = await runAutomaticBilling(runDate);
    await audit(user.id, "platform_auto_billing_run", "billing_invoices", null, { tenantId: user.tenantId, runDate, created: result.created.length, skipped: result.skipped.length });
    json(res, 200, { tenants: await platformTenants(), result });
    return;
  }

  // LEGACY FALLBACK - PLATFORM TENANT ADMIN RESET PASSWORD - SAFE TO REMOVE AFTER VALIDATION
  if (method === "POST" && url.pathname.match(/^\/api\/platform\/tenants\/\d+\/reset-password$/)) {
    const user = await requirePlatformOwner(req, res);
    if (!user) return;
    const tenantId = Number(url.pathname.split("/")[4]);
    const body = await readBody(req);
    const newPassword = String(body.password || "").trim();
    if (newPassword.length < 8) return json(res, 400, { error: "Password must be at least 8 characters." });
    const tenant = await db.prepare("SELECT id, name FROM tenants WHERE id = ?").get(tenantId);
    if (!tenant) return json(res, 404, { error: "Tenant not found" });
    const owner = await db.prepare(`
      SELECT id, username, email, name
      FROM users
      WHERE tenant_id = ? AND role = 'admin' AND active = 1 AND COALESCE(is_platform_owner, 0) = 0
      ORDER BY id
      LIMIT 1
    `).get(tenantId);
    if (!owner) return json(res, 404, { error: "No active clinic admin was found for this clinic." });
    await db.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?")
      .run(hashPassword(newPassword), owner.id, tenantId);
    await audit(user.id, "platform_reset_tenant_password", "users", owner.id, { tenantId: user.tenantId, targetTenantId: tenantId, targetUserId: owner.id });
    json(res, 200, { tenants: await platformTenants(), owner: { id: owner.id, username: owner.username, email: owner.email, name: owner.name }, tenant: { id: tenant.id, name: tenant.name } });
    return;
  }

  // LEGACY FALLBACK - PLATFORM TENANT UPDATE - SAFE TO REMOVE AFTER VALIDATION
  if (method === "PUT" && url.pathname.startsWith("/api/platform/tenants/")) {
    const user = await requirePlatformOwner(req, res);
    if (!user) return;
    const tenantId = Number(url.pathname.split("/").pop());
    const body = await readBody(req);
    const plan = planCatalog[body.plan] ? body.plan : "";
    const status = ["trial", "active", "past_due", "suspended", "cancelled"].includes(body.status) ? body.status : "";
    const billingDay = Math.min(Math.max(Number(body.billingDay || 1), 1), 31);
    const autoBillingEnabled = body.autoBillingEnabled === true || body.autoBillingEnabled === "true" || body.autoBillingEnabled === "on";
    if (!tenantId || !plan || !status) return json(res, 400, { error: "Valid tenant, plan, and status are required." });
    const tenant = await db.prepare("SELECT id FROM tenants WHERE id = ?").get(tenantId);
    if (!tenant) return json(res, 404, { error: "Tenant not found" });
    const existing = await db.prepare("SELECT id FROM subscriptions WHERE tenant_id = ? ORDER BY id DESC LIMIT 1").get(tenantId);
    if (existing) {
      await db.prepare("UPDATE subscriptions SET plan = ?, status = ?, billing_day = ?, auto_billing_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?")
        .run(plan, status, billingDay, autoBillingEnabled ? 1 : 0, existing.id, tenantId);
    } else {
      await db.prepare("INSERT INTO subscriptions (tenant_id, provider, status, plan, billing_day, auto_billing_enabled) VALUES (?, ?, ?, ?, ?, ?)")
        .run(tenantId, "manual", status, plan, billingDay, autoBillingEnabled ? 1 : 0);
    }
    await db.prepare("UPDATE tenants SET plan = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(plan, status, tenantId);
    await audit(user.id, "platform_update_tenant", "tenants", tenantId, { tenantId: user.tenantId, targetTenantId: tenantId, plan, status });
    json(res, 200, { tenants: await platformTenants() });
    return;
  }

  if (method === "GET" && url.pathname === "/api/settings") {
    const user = await requireUser(req, res);
    if (!user) return;
    json(res, 200, { settings: await clinicSettings(user.tenantId) });
    return;
  }

  if (method === "PUT" && url.pathname === "/api/settings") {
    const user = await requirePermission(req, res, "settings_write");
    if (!user) return;
    const body = await readBody(req);
    await updateClinicSettings(body, user.tenantId);
    await audit(user.id, "update", "settings", null, { tenantId: user.tenantId });
    json(res, 200, { settings: await clinicSettings(user.tenantId) });
    return;
  }

  if (method === "GET" && url.pathname === "/api/tenant") {
    const user = await requireUser(req, res);
    if (!user) return;
    const tenant = await db.prepare(`
      SELECT t.id, t.name, t.slug, t.status, t.plan, t.billing_email AS billingEmail,
             s.status AS subscriptionStatus, s.provider, s.provider_customer_id AS providerCustomerId,
             s.provider_subscription_id AS providerSubscriptionId, s.current_period_end AS currentPeriodEnd
      FROM tenants t
      LEFT JOIN subscriptions s ON s.tenant_id = t.id
      WHERE t.id = ?
      ORDER BY s.id DESC
      LIMIT 1
    `).get(user.tenantId);
    return json(res, 200, { tenant });
  }

  if (method === "PUT" && url.pathname === "/api/tenant") {
    const user = await requirePlatformOwner(req, res);
    if (!user) return;
    const body = await readBody(req);
    await db.prepare("UPDATE tenants SET name = ?, billing_email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(String(body.name || "Clinova Clinic").trim(), String(body.billingEmail || "").trim(), user.tenantId);
    await audit(user.id, "update", "tenants", user.tenantId, { tenantId: user.tenantId });
    const tenant = await db.prepare("SELECT id, name, slug, status, plan, billing_email AS billingEmail FROM tenants WHERE id = ?").get(user.tenantId);
    return json(res, 200, { tenant });
  }

  if (url.pathname === "/api/tenant/domains") {
    const user = await requirePlatformOwner(req, res);
    if (!user) return;
    if (method === "GET") return json(res, 200, { domains: await tenantDomains(user.tenantId) });
    if (method === "POST") {
      const body = await readBody(req);
      const domain = normalizeDomain(body.domain);
      if (!validDomain(domain)) return json(res, 400, { error: "Valid domain is required." });
      const existing = await db.prepare("SELECT id FROM tenant_domains WHERE domain = ?").get(domain);
      if (existing) return json(res, 409, { error: "Domain already exists." });
      const makePrimary = body.isPrimary === true || body.isPrimary === "true";
      if (makePrimary) await db.prepare("UPDATE tenant_domains SET is_primary = 0 WHERE tenant_id = ?").run(user.tenantId);
      const result = await db.prepare("INSERT INTO tenant_domains (tenant_id, domain, status, is_primary) VALUES (?, ?, ?, ?)")
        .run(user.tenantId, domain, "pending", makePrimary ? 1 : 0);
      await audit(user.id, "create", "tenant_domains", result.lastInsertRowid, { tenantId: user.tenantId, domain });
      return json(res, 201, { domains: await tenantDomains(user.tenantId), id: result.lastInsertRowid });
    }
  }

  if (url.pathname.startsWith("/api/tenant/domains/")) {
    const user = await requirePlatformOwner(req, res);
    if (!user) return;
    const domainId = Number(url.pathname.split("/").pop());
    const current = await db.prepare("SELECT id, domain FROM tenant_domains WHERE id = ? AND tenant_id = ?").get(domainId, user.tenantId);
    if (!current) return json(res, 404, { error: "Domain not found" });
    if (method === "PUT") {
      const body = await readBody(req);
      const status = ["pending", "active", "failed", "disabled"].includes(body.status) ? body.status : "pending";
      const makePrimary = body.isPrimary === true || body.isPrimary === "true";
      if (makePrimary) await db.prepare("UPDATE tenant_domains SET is_primary = 0 WHERE tenant_id = ?").run(user.tenantId);
      await db.prepare(`
        UPDATE tenant_domains
        SET status = ?, is_primary = ?, verified_at = CASE WHEN ? = 'active' THEN COALESCE(verified_at, CURRENT_TIMESTAMP) ELSE verified_at END, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ?
      `).run(status, makePrimary ? 1 : 0, status, domainId, user.tenantId);
      await audit(user.id, "update", "tenant_domains", domainId, { tenantId: user.tenantId, status, isPrimary: makePrimary });
      return json(res, 200, { domains: await tenantDomains(user.tenantId) });
    }
    if (method === "DELETE") {
      await db.prepare("DELETE FROM tenant_domains WHERE id = ? AND tenant_id = ?").run(domainId, user.tenantId);
      await audit(user.id, "delete", "tenant_domains", domainId, { tenantId: user.tenantId, domain: current.domain });
      return json(res, 200, { domains: await tenantDomains(user.tenantId) });
    }
  }

  // LEGACY FALLBACK - SYSTEM EXPORT - SAFE TO REMOVE AFTER VALIDATION
  if (method === "GET" && url.pathname === "/api/system/export") {
    const user = await requirePlatformOwner(req, res);
    if (!user) return;
    const exportBackup = createBackup({ reason: "download-export" });
    const backup = readFileSync(exportBackup.target);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    res.writeHead(200, {
      "Content-Type": config.databaseUrl ? "application/octet-stream" : "application/vnd.sqlite3",
      "Content-Disposition": `attachment; filename="clinova-${stamp}.${config.databaseUrl ? "dump" : "sqlite"}"`,
      "Content-Length": backup.length,
      "X-Content-Type-Options": "nosniff",
    });
    res.end(backup);
    await audit(user.id, "export", "system", null, { tenantId: user.tenantId });
    return;
  }

  // LEGACY FALLBACK - SYSTEM RESTORE - SAFE TO REMOVE AFTER VALIDATION
  if (method === "POST" && url.pathname === "/api/system/restore") {
    const user = await requirePlatformOwner(req, res);
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
    await audit(user.id, "restore_scheduled", "system", null, { tenantId: user.tenantId, source: file.filename, safetyBackup: safety.target });
    json(res, 200, { ok: true, safetyBackup: safety.target, restarting: true });
    setTimeout(() => process.exit(0), 500);
    return;
  }

  if (method === "GET" && url.pathname === "/api/bootstrap") {
    // LEGACY FALLBACK - BOOTSTRAP - SAFE TO REMOVE AFTER VALIDATION
    await handleBootstrapLegacy(req, res);
    return;
  }

  await crudRoutes(req, res, url);
}

async function handleBootstrapLegacy(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  if (user.platformOwner) {
    json(res, 200, {
      user,
      tenant: null,
      tenantDomains: [],
      platformTenants: await platformTenants(),
      billing: null,
      users: [],
      invitations: [],
      categories: [],
      services: [],
      clients: [],
      crmTasks: [],
      crmEvents: [],
      appointments: [],
      consentTemplates: [],
      consentSignatures: [],
      feedbackRequests: [],
      giftCards: [],
      messageLogs: [],
      settings: {},
      audits: [],
    });
    return;
  }
  json(res, 200, {
    user,
    tenant: await db.prepare("SELECT id, name, slug, status, plan, billing_email AS billingEmail FROM tenants WHERE id = ?").get(user.tenantId),
    tenantDomains: user.platformOwner ? await tenantDomains(user.tenantId) : [],
    platformTenants: user.platformOwner ? await platformTenants() : [],
    billing: user.platformOwner ? await tenantBilling(user.tenantId) : null,
    users: (await db.prepare("SELECT * FROM users WHERE tenant_id = ? AND COALESCE(is_platform_owner, 0) = 0 ORDER BY id").all(user.tenantId)).map(rowToUser),
    invitations: user.role === "admin" ? (await db.prepare(`
      SELECT id, email, name, role, token, expires_at AS expiresAt, accepted_at AS acceptedAt, created_at AS createdAt
      FROM user_invitations
      WHERE tenant_id = ?
      ORDER BY id DESC
      LIMIT 50
    `).all(user.tenantId)).map((row) => ({ ...row, inviteUrl: inviteUrl(req, row.token) })) : [],
    categories: await db.prepare("SELECT * FROM categories WHERE tenant_id = ? AND active = 1 ORDER BY name").all(user.tenantId),
    services: await db.prepare("SELECT id, name, category_id AS categoryId, duration, price, active FROM services WHERE tenant_id = ? ORDER BY name").all(user.tenantId),
    clients: await listClients(user),
    crmTasks: await listCrmTasks(user),
    crmEvents: await listCrmEvents(user.tenantId),
    appointments: await listAppointments(user),
    consentTemplates: await consentTemplates(user.tenantId),
    consentSignatures: user.role === "admin" || user.role === "reception" ? await consentSignatures(user.tenantId) : [],
    feedbackRequests: user.role === "admin" || user.role === "reception" ? await feedbackRequests(user.tenantId) : [],
    giftCards: user.role === "admin" || user.role === "reception" ? await giftCards(user.tenantId) : [],
    messageLogs: user.role === "admin" || user.role === "reception" ? await listMessageLogs(user.tenantId) : [],
    settings: await clinicSettings(user.tenantId),
    audits: user.role === "admin" ? await listAudit(user.tenantId) : [],
  });
}

async function crudRoutes(req, res, url) {
  const method = req.method;
  const parts = url.pathname.split("/").filter(Boolean);
  const resource = parts[1];
  const id = parts[2] ? Number(parts[2]) : null;

  if (resource === "users") {
    const user = await requirePermission(req, res, "users");
    if (!user) return;
    if (method === "GET") return json(res, 200, (await db.prepare("SELECT * FROM users WHERE tenant_id = ? AND COALESCE(is_platform_owner, 0) = 0 ORDER BY id").all(user.tenantId)).map(rowToUser));
    const body = await readBody(req);
    if (method === "POST") {
      const billing = await assertTenantCanWrite(user.tenantId, "team creation");
      if (limitReached(billing.usage.users, billing.limits.maxUsers)) return json(res, 402, { error: `Plan user limit reached (${billing.limits.maxUsers}).` });
      if (!body.password || String(body.password).length < 8) return json(res, 400, { error: "Password must be at least 8 characters." });
      if (!body.username || String(body.username).trim().length < 2) return json(res, 400, { error: "Username is required." });
      const result = await db.prepare("INSERT INTO users (tenant_id, username, email, password_hash, name, title, role, workdays, service_ids, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(user.tenantId, String(body.username).trim(), normalizeEmail(body.email), hashPassword(body.password), body.name, body.title || "", body.role, parseJsonArray(body.workdays), parseJsonArray(body.serviceIds), body.active === false ? 0 : 1);
      await audit(user.id, "create", "users", result.lastInsertRowid, { tenantId: user.tenantId });
      return json(res, 201, { id: result.lastInsertRowid });
    }
    if (method === "PUT" && id) {
      const currentRow = await db.prepare("SELECT email, is_platform_owner AS isPlatformOwner FROM users WHERE id = ? AND tenant_id = ?").get(id, user.tenantId);
      if (!currentRow) return json(res, 404, { error: "User not found." });
      if (currentRow.isPlatformOwner) return json(res, 403, { error: "Platform owner cannot be managed from clinic users." });
      const email = Object.prototype.hasOwnProperty.call(body, "email") ? normalizeEmail(body.email) : (currentRow.email || "");
      const passwordPart = body.password ? ", password_hash = ?" : "";
      const values = body.password
        ? [String(body.username || "").trim(), email, body.name, body.title || "", body.role, parseJsonArray(body.workdays), parseJsonArray(body.serviceIds), body.active === false ? 0 : 1, hashPassword(body.password), id]
        : [String(body.username || "").trim(), email, body.name, body.title || "", body.role, parseJsonArray(body.workdays), parseJsonArray(body.serviceIds), body.active === false ? 0 : 1, id];
      await db.prepare(`UPDATE users SET username = ?, email = ?, name = ?, title = ?, role = ?, workdays = ?, service_ids = ?, active = ?, updated_at = CURRENT_TIMESTAMP${passwordPart} WHERE id = ? AND tenant_id = ?`).run(...values, user.tenantId);
      await audit(user.id, "update", "users", id, { tenantId: user.tenantId });
      return json(res, 200, { ok: true });
    }
    if (method === "DELETE" && id) {
      const currentRow = await db.prepare("SELECT is_platform_owner AS isPlatformOwner FROM users WHERE id = ? AND tenant_id = ?").get(id, user.tenantId);
      if (!currentRow) return json(res, 404, { error: "User not found." });
      if (currentRow.isPlatformOwner) return json(res, 403, { error: "Platform owner cannot be managed from clinic users." });
      await db.prepare("UPDATE users SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?").run(id, user.tenantId);
      await audit(user.id, "deactivate", "users", id, { tenantId: user.tenantId });
      return json(res, 200, { ok: true });
    }
  }

  if (resource === "categories") {
    const user = await requirePermission(req, res, "categories");
    if (!user) return;
    if (method === "GET") return json(res, 200, await db.prepare("SELECT * FROM categories WHERE tenant_id = ? AND active = 1 ORDER BY name").all(user.tenantId));
    const body = await readBody(req);
    if (method === "POST") {
      const result = await db.prepare("INSERT INTO categories (tenant_id, name) VALUES (?, ?)").run(user.tenantId, body.name);
      await audit(user.id, "create", "categories", result.lastInsertRowid, { tenantId: user.tenantId });
      return json(res, 201, { id: result.lastInsertRowid });
    }
    if (method === "PUT" && id) {
      await db.prepare("UPDATE categories SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?").run(body.name, id, user.tenantId);
      await audit(user.id, "update", "categories", id, { tenantId: user.tenantId });
      return json(res, 200, { ok: true });
    }
    if (method === "DELETE" && id) {
      await db.prepare("UPDATE categories SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?").run(id, user.tenantId);
      await db.prepare("UPDATE services SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE category_id = ? AND tenant_id = ?").run(id, user.tenantId);
      await audit(user.id, "archive", "categories", id, { tenantId: user.tenantId });
      return json(res, 200, { ok: true });
    }
  }

  if (resource === "services") {
    const user = await requirePermission(req, res, "services");
    if (!user) return;
    if (method === "GET") return json(res, 200, await db.prepare("SELECT id, name, category_id AS categoryId, duration, price, active FROM services WHERE tenant_id = ? ORDER BY name").all(user.tenantId));
    const body = await readBody(req);
    if (method === "POST") {
      const result = await db.prepare("INSERT INTO services (tenant_id, name, category_id, duration, price, active) VALUES (?, ?, ?, ?, ?, ?)").run(user.tenantId, body.name, body.categoryId, body.duration, body.price, body.active === false ? 0 : 1);
      await audit(user.id, "create", "services", result.lastInsertRowid, { tenantId: user.tenantId });
      return json(res, 201, { id: result.lastInsertRowid });
    }
    if (method === "PUT" && id) {
      await db.prepare("UPDATE services SET name = ?, category_id = ?, duration = ?, price = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?").run(body.name, body.categoryId, body.duration, body.price, body.active === false ? 0 : 1, id, user.tenantId);
      await audit(user.id, "update", "services", id, { tenantId: user.tenantId });
      return json(res, 200, { ok: true });
    }
    if (method === "DELETE" && id) {
      await db.prepare("UPDATE services SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?").run(id, user.tenantId);
      await audit(user.id, "deactivate", "services", id, { tenantId: user.tenantId });
      return json(res, 200, { ok: true });
    }
  }

  if (resource === "clients" && id && parts[3] === "history" && method === "GET") {
    const user = await requirePermission(req, res, "clients_read");
    if (!user) return;
    if (!await canSeeClient(user, id)) return json(res, 403, { error: "„״§ ״×…„ƒ ״µ„״§״­״© „‡״°״§ ״§„״¹…„" });
    const client = (await listClients(user)).find((item) => item.id === id);
    const appointments = (await listAppointments(user)).filter((item) => item.clientId === id);
    return json(res, 200, { client, appointments, files: await clientFiles(id, user.tenantId) });
  }

  if (resource === "clients" && id && parts[3] === "files") {
    const user = await requirePermission(req, res, method === "GET" ? "clients_read" : "clients_write");
    if (!user) return;
    if (!await canSeeClient(user, id)) return json(res, 403, { error: "„״§ ״×…„ƒ ״µ„״§״­״© „‡״°״§ ״§„״¹…„" });
    if (method === "GET") return json(res, 200, await clientFiles(id, user.tenantId));
    if (method === "POST") {
      const { fields, files } = await readMultipart(req);
      const file = files.file;
      if (!file || file.buffer.length === 0) return json(res, 400, { error: "׳™׳© ׳׳‘׳—׳•׳¨ ׳§׳•׳‘׳¥ ׳׳”׳¢׳׳׳”" });
      if (!config.uploads.allowedTypes.includes(file.type)) return json(res, 400, { error: "׳¡׳•׳’ ׳”׳§׳•׳‘׳¥ ׳׳™׳ ׳• ׳ ׳×׳׳" });

      const ext = extname(file.filename).toLowerCase();
      const clientDir = resolve(config.uploads.dir, "clients", String(id));
      mkdirSync(clientDir, { recursive: true });
      const storedName = `${Date.now()}-${randomUUID()}${ext}`;
      const target = resolve(clientDir, storedName);
      writeFileSync(target, file.buffer);

      const displayName = String(fields.name || file.filename).trim() || file.filename;
      const result = await db.prepare("INSERT INTO client_files (tenant_id, client_id, name, url, original_name, mime_type, size, path, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(user.tenantId, id, displayName, "", file.filename, file.type, file.buffer.length, target, fields.notes || "");
      const downloadUrl = `/api/client-files/${result.lastInsertRowid}/download`;
      await db.prepare("UPDATE client_files SET url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(downloadUrl, result.lastInsertRowid);
      await audit(user.id, "create", "client_files", result.lastInsertRowid, { tenantId: user.tenantId });
      return json(res, 201, { id: result.lastInsertRowid, url: downloadUrl });
    }
  }

  if (resource === "client-files" && method === "GET" && id && parts[3] === "download") {
    const user = await requirePermission(req, res, "clients_read");
    if (!user) return;
    const file = await clientFileById(id, user.tenantId);
    if (!file) return json(res, 404, { error: "׳”׳§׳•׳‘׳¥ ׳׳ ׳ ׳׳¦׳" });
    if (!await canSeeClient(user, file.clientId)) return json(res, 403, { error: "׳׳™׳ ׳”׳¨׳©׳׳” ׳׳§׳•׳‘׳¥ ׳–׳”" });
    if (!file.path) {
      res.writeHead(302, { Location: file.url });
      res.end();
      return;
    }
    if (!existsSync(file.path)) return json(res, 404, { error: "׳”׳§׳•׳‘׳¥ ׳׳ ׳ ׳׳¦׳ ׳‘׳׳—׳¡׳•׳" });
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
    await db.prepare("UPDATE client_files SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?").run(id, user.tenantId);
    await audit(user.id, "archive", "client_files", id, { tenantId: user.tenantId });
    return json(res, 200, { ok: true });
  }

  if (resource === "clients") {
    const user = await requirePermission(req, res, method === "GET" ? "clients_read" : "clients_write");
    if (!user) return;
    if (method === "GET") return json(res, 200, await listClients(user));
    const body = await readBody(req);
    if (method === "POST") {
      const billing = await assertTenantCanWrite(user.tenantId, "client creation");
      if (limitReached(billing.usage.clients, billing.limits.maxClients)) return json(res, 402, { error: `Plan client limit reached (${billing.limits.maxClients}).` });
      const result = await db.prepare("INSERT INTO clients (tenant_id, fname, lname, phone, email, therapist_id, stage, source, tags, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(user.tenantId, body.fname, body.lname, body.phone, body.email || "", body.therapistId || null, body.stage || "lead", body.source || "", parseTags(body.tags), body.notes || "");
      await addCrmEvent({ tenantId: user.tenantId, clientId: result.lastInsertRowid, userId: user.id, type: "client_created", description: "Client profile created" });
      await audit(user.id, "create", "clients", result.lastInsertRowid, { tenantId: user.tenantId });
      return json(res, 201, { id: result.lastInsertRowid });
    }
    if (method === "PUT" && id) {
      const current = await db.prepare("SELECT stage, source, tags FROM clients WHERE id = ? AND tenant_id = ?").get(id, user.tenantId);
      if (!current) return json(res, 404, { error: "Client not found" });
      const nextStage = Object.prototype.hasOwnProperty.call(body, "stage") ? body.stage || "lead" : current.stage || "lead";
      const nextSource = Object.prototype.hasOwnProperty.call(body, "source") ? body.source || "" : current.source || "";
      const nextTags = Object.prototype.hasOwnProperty.call(body, "tags") ? parseTags(body.tags) : current.tags || "[]";
      await db.prepare("UPDATE clients SET fname = ?, lname = ?, phone = ?, email = ?, therapist_id = ?, stage = ?, source = ?, tags = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?").run(body.fname, body.lname, body.phone, body.email || "", body.therapistId || null, nextStage, nextSource, nextTags, body.notes || "", id, user.tenantId);
      if (current.stage !== nextStage) {
        await addCrmEvent({ tenantId: user.tenantId, clientId: id, userId: user.id, type: "stage_changed", description: `${current.stage || "lead"} -> ${nextStage}` });
      }
      await audit(user.id, "update", "clients", id, { tenantId: user.tenantId });
      return json(res, 200, { ok: true });
    }
    if (method === "DELETE" && id) {
      await db.prepare("UPDATE clients SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?").run(id, user.tenantId);
      await db.prepare("UPDATE appointments SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE client_id = ? AND tenant_id = ?").run(id, user.tenantId);
      await audit(user.id, "archive", "clients", id, { tenantId: user.tenantId });
      return json(res, 200, { ok: true });
    }
  }

  if (resource === "crm-tasks") {
    const user = await requirePermission(req, res, method === "GET" ? "crm" : "crm_write");
    if (!user) return;
    if (method === "GET") return json(res, 200, await listCrmTasks(user));
    const body = await readBody(req);
    if (method === "POST") {
      const client = await db.prepare("SELECT id FROM clients WHERE id = ? AND tenant_id = ? AND active = 1").get(body.clientId, user.tenantId);
      if (!client) return json(res, 404, { error: "Client not found." });
      const result = await db.prepare("INSERT INTO crm_tasks (tenant_id, client_id, assigned_to, type, title, due_date, priority, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(user.tenantId, body.clientId, body.assignedTo || user.id, body.type || "follow_up", body.title || "Follow up", body.dueDate || null, body.priority || "normal", body.notes || "");
      await addCrmEvent({ tenantId: user.tenantId, clientId: body.clientId, userId: user.id, type: "task_created", description: body.title || "Follow up" });
      await audit(user.id, "create", "crm_tasks", result.lastInsertRowid, { tenantId: user.tenantId });
      return json(res, 201, { id: result.lastInsertRowid });
    }
    if (method === "PUT" && id) {
      const task = await db.prepare("SELECT client_id FROM crm_tasks WHERE id = ? AND tenant_id = ?").get(id, user.tenantId);
      if (!task) return json(res, 404, { error: "Task not found." });
      const status = ["open", "done", "cancelled"].includes(body.status) ? body.status : "open";
      await db.prepare("UPDATE crm_tasks SET assigned_to = ?, type = ?, title = ?, due_date = ?, status = ?, priority = ?, notes = ?, completed_at = CASE WHEN ? = 'done' THEN CURRENT_TIMESTAMP ELSE completed_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?")
        .run(body.assignedTo || user.id, body.type || "follow_up", body.title || "Follow up", body.dueDate || null, status, body.priority || "normal", body.notes || "", status, id, user.tenantId);
      if (status === "done") await db.prepare("UPDATE clients SET last_contacted_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?").run(task.client_id, user.tenantId);
      await addCrmEvent({ tenantId: user.tenantId, clientId: task.client_id, userId: user.id, type: "task_updated", description: `${body.title || "Follow up"} (${status})` });
      await audit(user.id, "update", "crm_tasks", id, { tenantId: user.tenantId });
      return json(res, 200, { ok: true });
    }
  }

  if (resource === "appointments") {
    const key = method === "DELETE" ? "appointments_delete" : method === "GET" ? "appointments_read" : "appointments_write";
    const user = await requirePermission(req, res, key);
    if (!user) return;
    if (method === "POST" && id && parts[3] === "whatsapp") {
      const appointment = (await listAppointments(user)).find((item) => item.id === id);
      if (!appointment) return json(res, 404, { error: "׳”׳×׳•׳¨ ׳׳ ׳ ׳׳¦׳" });
      const settings = await clinicSettings(user.tenantId);
      const message = renderReminderMessage(appointment, settings);
      const result = await sendTenantWhatsApp({ user, entity: "appointments", entityId: id, to: appointment.clientPhone, message });
      await audit(user.id, result.ok ? "whatsapp_sent" : "whatsapp_fallback", "appointments", id, {
        tenantId: user.tenantId,
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
      await db.prepare("UPDATE appointments SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?").run(id, user.tenantId);
      await audit(user.id, "archive", "appointments", id, { tenantId: user.tenantId });
      return json(res, 200, { ok: true });
    }
    const body = await readBody(req);
    const therapistId = user.role === "therapist" ? user.id : body.therapistId;
    const conflict = await appointmentConflict({ id, tenantId: user.tenantId, date: body.date, time: body.time, serviceId: body.serviceId, therapistId });
    if (conflict) return json(res, 409, { error: "appointment_category_conflict", details: conflict });
    if ((body.status || "pending") === "done") {
      const missingConsents = await missingLegalConsents({ tenantId: user.tenantId, clientId: body.clientId, appointmentId: id, serviceId: body.serviceId });
      if (missingConsents.length) {
        return json(res, 409, { error: "consent_required", details: { missing: missingConsents } });
      }
    }
    const paymentStatus = ["paid", "unpaid", "deposit"].includes(body.paymentStatus) ? body.paymentStatus : "unpaid";
    const paidAmount = Number(body.paidAmount || 0);
    if (method === "POST") {
      const result = await db.prepare("INSERT INTO appointments (tenant_id, client_id, service_id, therapist_id, date, time, status, payment_status, paid_amount, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(user.tenantId, body.clientId, body.serviceId, therapistId, body.date, body.time, body.status || "pending", paymentStatus, paidAmount, body.notes || "");
      await audit(user.id, "create", "appointments", result.lastInsertRowid, { tenantId: user.tenantId });
      return json(res, 201, { id: result.lastInsertRowid });
    }
    if (method === "PUT" && id) {
      await db.prepare("UPDATE appointments SET client_id = ?, service_id = ?, therapist_id = ?, date = ?, time = ?, status = ?, payment_status = ?, paid_amount = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?").run(body.clientId, body.serviceId, therapistId, body.date, body.time, body.status || "pending", paymentStatus, paidAmount, body.notes || "", id, user.tenantId);
      await audit(user.id, "update", "appointments", id, { tenantId: user.tenantId });
      return json(res, 200, { ok: true });
    }
  }

  if (resource === "consents") {
    const user = await requirePermission(req, res, method === "GET" || parts[3] === "sign" ? "consents" : "consents_write");
    if (!user) return;
    if (method === "POST" && id && parts[3] === "sign") {
      const body = await readBody(req);
      if (!body.signatureData || !String(body.signatureData).startsWith("data:image/")) return json(res, 400, { error: "Signature is required." });
      const clientId = body.clientId || null;
      const appointmentId = body.appointmentId || null;
      const existingSignature = await db.prepare(`
        SELECT id
        FROM consent_signatures
        WHERE tenant_id = ?
          AND template_id = ?
          AND COALESCE(client_id, 0) = ?
          AND COALESCE(appointment_id, 0) = ?
        LIMIT 1
      `).get(user.tenantId, id, Number(clientId || 0), Number(appointmentId || 0));
      if (existingSignature) {
        return json(res, 409, { error: body.lang === "he" ? "׳ ׳—׳×׳ ׳›׳‘׳¨" : "״×… ״§„״×ˆ‚״¹" });
      }
      const result = await db.prepare("INSERT INTO consent_signatures (tenant_id, template_id, client_id, appointment_id, signer_name, signature_data) VALUES (?, ?, ?, ?, ?, ?)")
        .run(user.tenantId, id, clientId, appointmentId, String(body.signerName || ""), body.signatureData);
      const fileId = await createSignedConsentClientFile({
        signatureId: result.lastInsertRowid,
        tenantId: user.tenantId,
        templateId: id,
        clientId,
        appointmentId,
        signerName: String(body.signerName || ""),
        signatureData: body.signatureData,
        lang: body.lang === "ar" ? "ar" : "he",
      });
      await audit(user.id, "sign", "consent_templates", id, { tenantId: user.tenantId, signatureId: result.lastInsertRowid, clientFileId: fileId });
      return json(res, 201, { id: result.lastInsertRowid, clientFileId: fileId });
    }
    if (method === "GET" && id && parts[3] === "download") {
      const file = await consentTemplateById(id, user.tenantId);
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
    if (method === "GET") return json(res, 200, await consentTemplates(user.tenantId));
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
      const result = await db.prepare("INSERT INTO consent_templates (tenant_id, category_id, title, url, original_name, mime_type, size, path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(user.tenantId, fields.categoryId || null, String(fields.title || file.filename).trim(), "", file.filename, file.type, file.buffer.length, target);
      const downloadUrl = `/api/consents/${result.lastInsertRowid}/download`;
      await db.prepare("UPDATE consent_templates SET url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(downloadUrl, result.lastInsertRowid);
      await audit(user.id, "create", "consent_templates", result.lastInsertRowid, { tenantId: user.tenantId });
      return json(res, 201, { id: result.lastInsertRowid, url: downloadUrl });
    }
    if (method === "DELETE" && id) {
      await db.prepare("UPDATE consent_templates SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?").run(id, user.tenantId);
      await audit(user.id, "archive", "consent_templates", id, { tenantId: user.tenantId });
      return json(res, 200, { ok: true });
    }
  }

  if (resource === "feedback") {
    const user = await requirePermission(req, res, "feedback");
    if (!user) return;
    if (method === "GET") return json(res, 200, await feedbackRequests(user.tenantId));
    if (method === "POST") {
      const body = await readBody(req);
      const appointment = (await listAppointments(user)).find((item) => item.id === Number(body.appointmentId));
      if (!appointment) return json(res, 404, { error: "Appointment not found." });
      const token = randomUUID();
      const result = await db.prepare("INSERT INTO feedback_requests (tenant_id, appointment_id, token) VALUES (?, ?, ?)").run(user.tenantId, appointment.id, token);
      const proto = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const link = `${proto}://${host}/feedback.html?token=${encodeURIComponent(token)}`;
      const message = `׳©׳׳•׳ ${appointment.clientName}, ׳ ׳©׳׳— ׳׳§׳‘׳ ׳—׳•׳•׳× ׳“׳¢׳× ׳§׳¦׳¨׳” ׳׳—׳¨׳™ ׳”׳˜׳™׳₪׳•׳: ${link}`;
      const settings = await clinicSettings(user.tenantId);
      const finalMessage = renderTemplate(settings.whatsappFeedbackTemplate || message, {
        client: appointment.clientName,
        clinic: settings.clinicName || "Clinova",
        service: appointment.serviceName,
        link,
      });
      const sent = await sendTenantWhatsApp({ user, entity: "feedback_requests", entityId: result.lastInsertRowid, to: appointment.clientPhone, message: finalMessage });
      await audit(user.id, sent.ok ? "feedback_whatsapp_sent" : "feedback_whatsapp_fallback", "feedback_requests", result.lastInsertRowid, { tenantId: user.tenantId });
      return json(res, 201, { id: result.lastInsertRowid, ...sent, fallbackUrl: sent.fallbackUrl || whatsappFallbackUrl(appointment.clientPhone, finalMessage) });
    }
  }

  // LEGACY FALLBACK - GIFTS CRUD - SAFE TO REMOVE AFTER VALIDATION
  if (resource === "gifts") {
    const user = await requirePermission(req, res, "gifts");
    if (!user) return;
    if (method === "GET") return json(res, 200, await giftCards(user.tenantId));
    if (method === "POST" && id && parts[3] === "whatsapp") {
      const gift = (await giftCards(user.tenantId)).find((item) => item.id === id);
      if (!gift) return json(res, 404, { error: "Gift card not found." });
      const message = `נ ${gift.toClientName || ""}, ׳§׳™׳‘׳׳× ׳׳×׳ ׳” ׳-${gift.fromClientName || "Clinova"}: ${gift.sessions} ״¬„״³״© ${gift.serviceName || ""}. ׳§׳•׳“ ׳”׳׳×׳ ׳”: ${gift.code}. ${gift.message || ""}`;
      const settings = await clinicSettings(user.tenantId);
      const finalMessage = renderTemplate(settings.whatsappGiftTemplate || message, {
        from: gift.fromClientName || settings.clinicName || "Clinova",
        to: gift.toClientName || "",
        sessions: gift.sessions,
        service: gift.serviceName || "",
        code: gift.code,
        message: gift.message || "",
      });
      const sent = await sendTenantWhatsApp({ user, entity: "gift_cards", entityId: id, to: gift.toClientPhone, message: finalMessage });
      await audit(user.id, sent.ok ? "gift_whatsapp_sent" : "gift_whatsapp_fallback", "gift_cards", id, { tenantId: user.tenantId });
      return json(res, 200, { ...sent, fallbackUrl: sent.fallbackUrl || whatsappFallbackUrl(gift.toClientPhone, finalMessage) });
    }
    if (method === "POST") {
      const body = await readBody(req);
      const code = `GIFT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const result = await db.prepare("INSERT INTO gift_cards (tenant_id, code, from_client_id, to_client_id, service_id, sessions, message) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(user.tenantId, code, body.fromClientId || null, body.toClientId || null, body.serviceId || null, Math.max(1, Number(body.sessions || 1)), String(body.message || ""));
      await audit(user.id, "create", "gift_cards", result.lastInsertRowid, { tenantId: user.tenantId });
      return json(res, 201, { id: result.lastInsertRowid, code });
    }
    if (method === "PUT" && id) {
      const body = await readBody(req);
      await db.prepare("UPDATE gift_cards SET status = ?, redeemed_at = CASE WHEN ? = 'redeemed' THEN CURRENT_TIMESTAMP ELSE redeemed_at END WHERE id = ? AND tenant_id = ?")
        .run(body.status || "active", body.status || "active", id, user.tenantId);
      await audit(user.id, "update", "gift_cards", id, { tenantId: user.tenantId });
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
      WHERE a.tenant_id = ? AND a.active = 1
    `).all(user.tenantId);
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
    return json(res, 200, await listAudit(user.tenantId));
  }

  json(res, 404, { error: "״§„…״³״§״± ״÷״± …ˆ״¬ˆ״¯" });
}

async function listAudit(tenantId = 1) {
  const rows = await db.prepare(`
    SELECT a.id, a.action, a.entity, a.entity_id AS entityId, a.details, a.created_at AS createdAt, u.name AS userName
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.user_id
    WHERE a.tenant_id = ?
    ORDER BY a.id DESC
    LIMIT 100
  `).all(tenantId);
  return rows.map((row) => ({
    ...row,
    details: JSON.parse(row.details || "{}"),
  }));
}

function createClinovaServer() {
  return createServer(async (req, res) => {
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
}

export {
  api,
  clinicSettings,
  consentSignatures,
  consentTemplates,
  createClinovaServer,
  feedbackRequests,
  giftCards,
  handleBootstrapLegacy,
  inviteUrl,
  json,
  listAppointments,
  listAudit,
  listClients,
  listCrmEvents,
  listCrmTasks,
  listMessageLogs,
  platformTenants,
  requireUser,
  serveStatic,
  tenantBilling,
  tenantDomains,
};
