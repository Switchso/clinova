import { audit, db, findLoginUser } from "../db.js";
import { rowToUser } from "../shared/auth/user-mapper.js";

export async function findUserForLogin(identifier, tenant) {
  return await findLoginUser(identifier, tenant);
}

export async function createSession(id, tenantId, userId, expiresAt) {
  await db.prepare("INSERT INTO sessions (id, tenant_id, user_id, expires_at) VALUES (?, ?, ?, ?)")
    .run(id, tenantId, userId, expiresAt);
}

export async function deleteSession(id) {
  await db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
}

export async function findActiveSession(id, now) {
  return await db.prepare("SELECT tenant_id, user_id FROM sessions WHERE id = ? AND expires_at > ?")
    .get(id, now);
}

export async function findActiveUser(userId, tenantId) {
  return await db.prepare("SELECT * FROM users WHERE id = ? AND tenant_id = ? AND active = 1")
    .get(userId, tenantId);
}

export function toUser(row) {
  return rowToUser(row);
}

export async function auditLogin(userId, tenantId) {
  await audit(userId, "login", "session", null, { tenantId });
}
