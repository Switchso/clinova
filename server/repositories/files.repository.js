import { audit, db } from "../db.js";

export async function canSeeClient(user, clientId) {
  if (user.role !== "therapist") {
    const row = await db.prepare("SELECT id FROM clients WHERE id = ? AND tenant_id = ? AND active = 1")
      .get(clientId, user.tenantId);
    return Boolean(row);
  }
  const row = await db.prepare("SELECT id FROM clients WHERE id = ? AND tenant_id = ? AND active = 1 AND therapist_id = ?")
    .get(clientId, user.tenantId, user.id);
  return Boolean(row);
}

export async function listClientFiles(clientId, tenantId) {
  return await db.prepare(`
    SELECT id, client_id AS clientId, name, url, original_name AS originalName, mime_type AS mimeType, size, notes, created_at AS createdAt
    FROM client_files
    WHERE tenant_id = ? AND active = 1 AND client_id = ?
    ORDER BY id DESC
  `).all(tenantId, clientId);
}

export async function clientFileById(id, tenantId) {
  return await db.prepare(`
    SELECT id, client_id AS clientId, name, url, original_name AS originalName, mime_type AS mimeType, size, path, notes, active
    FROM client_files
    WHERE id = ? AND tenant_id = ? AND active = 1
  `).get(id, tenantId);
}

export async function createClientFile({ tenantId, clientId, name, originalName, mimeType, size, path, notes }) {
  const result = await db.prepare(`
    INSERT INTO client_files (tenant_id, client_id, name, url, original_name, mime_type, size, path, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(tenantId, clientId, name, "", originalName, mimeType, size, path, notes);
  return result.lastInsertRowid;
}

export async function updateClientFileUrl(id, url) {
  await db.prepare("UPDATE client_files SET url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(url, id);
}

export async function archiveClientFile(id, tenantId) {
  const result = await db.prepare("UPDATE client_files SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?")
    .run(id, tenantId);
  return result.changes;
}

export async function auditFile(userId, action, entityId, tenantId) {
  await audit(userId, action, "client_files", entityId, { tenantId });
}
