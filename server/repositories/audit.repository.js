import { db } from "../db.js";

export async function listAuditRows(tenantId) {
  return await db.prepare(`
    SELECT a.id, a.action, a.entity, a.entity_id AS entityId, a.details, a.created_at AS createdAt, u.name AS userName
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.user_id
    WHERE a.tenant_id = ?
    ORDER BY a.id DESC
    LIMIT 100
  `).all(tenantId);
}
