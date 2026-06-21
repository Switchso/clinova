import { audit, db } from "../../db.js";

export async function findUserById(tenantId, userId) {
  return db.prepare("SELECT * FROM users WHERE id = ? AND tenant_id = ?").get(userId, tenantId);
}

export async function updateUserPassword(tenantId, userId, passwordHash) {
  await db.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?")
    .run(passwordHash, userId, tenantId);
}

export async function deleteUserSessions(tenantId, userId) {
  await db.prepare("DELETE FROM sessions WHERE user_id = ? AND tenant_id = ?").run(userId, tenantId);
}

export async function auditPasswordChange(userId, tenantId) {
  await audit(userId, "change_password", "users", userId, { tenantId });
}
