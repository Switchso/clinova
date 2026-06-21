import { audit, db } from "../db.js";

export async function listMessageLogs(tenantId) {
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

export async function logMessage({ tenantId, userId, entity, entityId, recipient, message, result = {}, error = "" }) {
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

export async function clinicSettings(tenantId) {
  const rows = await db.prepare("SELECT key, value FROM clinic_settings WHERE tenant_id = ? ORDER BY key").all(tenantId);
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function tenantBillingSnapshot(tenantId) {
  const tenant = await db.prepare("SELECT id, status, plan FROM tenants WHERE id = ?").get(tenantId);
  const subscription = await db.prepare(`
    SELECT status, plan
    FROM subscriptions
    WHERE tenant_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(tenantId);
  return {
    plan: subscription?.plan || tenant?.plan || "starter",
    status: subscription?.status || tenant?.status || "trial",
  };
}

export async function listAppointmentRows(user) {
  const base = `
    SELECT a.*, c.fname, c.lname, c.phone, s.name AS service_name, s.duration, s.price, u.name AS therapist_name
    FROM appointments a
    JOIN clients c ON c.id = a.client_id
    JOIN services s ON s.id = a.service_id
    JOIN users u ON u.id = a.therapist_id
  `;
  return user.role === "therapist"
    ? await db.prepare(`${base} WHERE a.tenant_id = ? AND a.active = 1 AND a.therapist_id = ? ORDER BY a.date DESC, a.time DESC`).all(user.tenantId, user.id)
    : await db.prepare(`${base} WHERE a.tenant_id = ? AND a.active = 1 ORDER BY a.date DESC, a.time DESC`).all(user.tenantId);
}

export async function listGiftCards(tenantId) {
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

export async function auditWhatsApp(userId, action, entity, entityId, details) {
  await audit(userId, action, entity, entityId, details);
}
