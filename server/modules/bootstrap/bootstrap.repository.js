import { db } from "../../db.js";

export async function findTenantForBootstrap(tenantId) {
  return await db.prepare("SELECT id, name, slug, status, plan, billing_email AS billingEmail FROM tenants WHERE id = ?").get(tenantId);
}

export async function listUsersForBootstrap(tenantId) {
  return await db.prepare("SELECT * FROM users WHERE tenant_id = ? AND COALESCE(is_platform_owner, 0) = 0 ORDER BY id").all(tenantId);
}

export async function listInvitationsForBootstrap(tenantId) {
  return await db.prepare(`
      SELECT id, email, name, role, token, expires_at AS expiresAt, accepted_at AS acceptedAt, created_at AS createdAt
      FROM user_invitations
      WHERE tenant_id = ?
      ORDER BY id DESC
      LIMIT 50
    `).all(tenantId);
}

export async function listCategoriesForBootstrap(tenantId) {
  return await db.prepare("SELECT * FROM categories WHERE tenant_id = ? AND active = 1 ORDER BY name").all(tenantId);
}

export async function listServicesForBootstrap(tenantId) {
  return await db.prepare("SELECT id, name, category_id AS categoryId, duration, price, active FROM services WHERE tenant_id = ? ORDER BY name").all(tenantId);
}
