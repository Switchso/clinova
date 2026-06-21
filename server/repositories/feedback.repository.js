import { audit, db } from "../db.js";

export async function publicFeedbackByToken(token) {
  return await db.prepare(`
    SELECT f.id, f.status, f.rating, f.comment, c.fname || ' ' || c.lname AS clientName,
           s.name AS serviceName, a.date, a.time
    FROM feedback_requests f
    JOIN appointments a ON a.id = f.appointment_id
    JOIN clients c ON c.id = a.client_id
    JOIN services s ON s.id = a.service_id
    WHERE f.token = ?
  `).get(token);
}

export async function submitPublicFeedback(token, rating, comment) {
  return await db.prepare("UPDATE feedback_requests SET rating = ?, comment = ?, status = 'submitted', submitted_at = CURRENT_TIMESTAMP WHERE token = ?")
    .run(rating, comment, token);
}

export async function listFeedbackRequests(tenantId) {
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

export async function createFeedbackRequest(tenantId, appointmentId, token) {
  const result = await db.prepare("INSERT INTO feedback_requests (tenant_id, appointment_id, token) VALUES (?, ?, ?)")
    .run(tenantId, appointmentId, token);
  return result.lastInsertRowid;
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
  const plan = subscription?.plan || tenant?.plan || "starter";
  return {
    plan,
    status: subscription?.status || tenant?.status || "trial",
  };
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

export async function auditFeedback(userId, action, entityId, tenantId) {
  await audit(userId, action, "feedback_requests", entityId, { tenantId });
}
