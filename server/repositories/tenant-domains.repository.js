import { audit, db } from "../db.js";

export async function tenantDomains(tenantId) {
  return await db.prepare(`
    SELECT id, domain, status, is_primary AS isPrimary, verified_at AS verifiedAt, created_at AS createdAt, updated_at AS updatedAt
    FROM tenant_domains
    WHERE tenant_id = ?
    ORDER BY is_primary DESC, id DESC
  `).all(tenantId);
}

export async function findDomainByName(domain) {
  return await db.prepare("SELECT id FROM tenant_domains WHERE domain = ?").get(domain);
}

export async function clearPrimaryDomains(tenantId) {
  await db.prepare("UPDATE tenant_domains SET is_primary = 0 WHERE tenant_id = ?").run(tenantId);
}

export async function createTenantDomain(tenantId, domain, makePrimary) {
  const result = await db.prepare("INSERT INTO tenant_domains (tenant_id, domain, status, is_primary) VALUES (?, ?, ?, ?)")
    .run(tenantId, domain, "pending", makePrimary ? 1 : 0);
  return result.lastInsertRowid;
}

export async function findTenantDomain(id, tenantId) {
  return await db.prepare("SELECT id, domain FROM tenant_domains WHERE id = ? AND tenant_id = ?").get(id, tenantId);
}

export async function updateTenantDomain(id, tenantId, { status, makePrimary }) {
  await db.prepare(`
    UPDATE tenant_domains
    SET status = ?, is_primary = ?, verified_at = CASE WHEN ? = 'active' THEN COALESCE(verified_at, CURRENT_TIMESTAMP) ELSE verified_at END, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ?
  `).run(status, makePrimary ? 1 : 0, status, id, tenantId);
}

export async function deleteTenantDomain(id, tenantId) {
  await db.prepare("DELETE FROM tenant_domains WHERE id = ? AND tenant_id = ?").run(id, tenantId);
}

export async function auditTenantDomain(userId, action, entityId, details) {
  await audit(userId, action, "tenant_domains", entityId, details);
}
