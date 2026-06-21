import { audit, db } from "../db.js";
import { rowToUser } from "../shared/auth/user-mapper.js";

export async function listTenantInvitations(tenantId) {
  return await db.prepare(`
    SELECT i.id, i.email, i.name, i.role, i.token, i.expires_at AS expiresAt, i.accepted_at AS acceptedAt,
           i.created_at AS createdAt, u.name AS invitedByName
    FROM user_invitations i
    LEFT JOIN users u ON u.id = i.invited_by AND u.tenant_id = i.tenant_id
    WHERE i.tenant_id = ?
    ORDER BY i.id DESC
    LIMIT 50
  `).all(tenantId);
}

export async function findInvitationPreview(token) {
  return await db.prepare(`
    SELECT i.id, i.email, i.name, i.role, i.expires_at AS expiresAt, i.accepted_at AS acceptedAt,
           t.name AS clinicName, t.slug AS tenantSlug
    FROM user_invitations i
    JOIN tenants t ON t.id = i.tenant_id
    WHERE i.token = ?
    LIMIT 1
  `).get(token);
}

export async function findInvitationByToken(token) {
  return await db.prepare("SELECT * FROM user_invitations WHERE token = ? LIMIT 1").get(token);
}

export async function findExistingUserByEmail(tenantId, email) {
  return await db.prepare("SELECT id FROM users WHERE tenant_id = ? AND (lower(email) = ? OR lower(username) = ?)")
    .get(tenantId, email, email);
}

export async function createInvitedUser(invitation, passwordHash, email) {
  const result = await db.prepare(`
    INSERT INTO users (tenant_id, username, email, password_hash, name, title, role, workdays, service_ids, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(invitation.tenant_id, email, email, passwordHash, invitation.name, "", invitation.role, "[]", "[]", 1);
  return result.lastInsertRowid;
}

export async function findUserByIdAndTenant(id, tenantId) {
  return await db.prepare("SELECT * FROM users WHERE id = ? AND tenant_id = ?").get(id, tenantId);
}

export async function markInvitationAccepted(id) {
  await db.prepare("UPDATE user_invitations SET accepted_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
}

export async function createSession(id, tenantId, userId, expiresAt) {
  await db.prepare("INSERT INTO sessions (id, tenant_id, user_id, expires_at) VALUES (?, ?, ?, ?)")
    .run(id, tenantId, userId, expiresAt);
}

export async function markPendingInvitationsAccepted(tenantId, email) {
  await db.prepare("UPDATE user_invitations SET accepted_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND lower(email) = ? AND accepted_at IS NULL")
    .run(tenantId, email);
}

export async function createInvitationRecord({ tenantId, email, name, role, token, invitedBy, expiresAt }) {
  const result = await db.prepare(`
    INSERT INTO user_invitations (tenant_id, email, name, role, token, invited_by, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(tenantId, email, name, role, token, invitedBy, expiresAt);
  return result.lastInsertRowid;
}

export async function revokeInvitation(id, tenantId) {
  const result = await db.prepare("UPDATE user_invitations SET accepted_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ? AND accepted_at IS NULL")
    .run(id, tenantId);
  return result.changes;
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
  const userUsage = await db.prepare("SELECT COUNT(*) AS count FROM users WHERE tenant_id = ? AND active = 1 AND COALESCE(is_platform_owner, 0) = 0")
    .get(tenantId);
  return {
    plan: subscription?.plan || tenant?.plan || "starter",
    status: subscription?.status || tenant?.status || "trial",
    usage: { users: Number(userUsage?.count || 0) },
  };
}

export function toUser(row) {
  return rowToUser(row);
}

export async function auditInvitation(userId, action, entity, entityId, details) {
  await audit(userId, action, entity, entityId, details);
}
