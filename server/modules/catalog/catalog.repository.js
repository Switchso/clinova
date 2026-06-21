import { audit, db } from "../../db.js";

export async function listCategories(tenantId) {
  return db.prepare("SELECT * FROM categories WHERE tenant_id = ? AND active = 1 ORDER BY name").all(tenantId);
}

export async function createCategory(tenantId, name) {
  const result = await db.prepare("INSERT INTO categories (tenant_id, name) VALUES (?, ?)").run(tenantId, name);
  return result.lastInsertRowid;
}

export async function updateCategory(id, tenantId, name) {
  const result = await db.prepare("UPDATE categories SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?").run(name, id, tenantId);
  return result.changes;
}

export async function archiveCategory(id, tenantId) {
  const result = await db.prepare("UPDATE categories SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?").run(id, tenantId);
  return result.changes;
}

export async function archiveServicesByCategory(categoryId, tenantId) {
  await db.prepare("UPDATE services SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE category_id = ? AND tenant_id = ?").run(categoryId, tenantId);
}

export async function listServices(tenantId) {
  return db.prepare("SELECT id, name, category_id AS categoryId, duration, price, active FROM services WHERE tenant_id = ? ORDER BY name").all(tenantId);
}

export async function createService(tenantId, body) {
  const result = await db
    .prepare("INSERT INTO services (tenant_id, name, category_id, duration, price, active) VALUES (?, ?, ?, ?, ?, ?)")
    .run(tenantId, body.name, body.categoryId, body.duration, body.price, body.active === false ? 0 : 1);
  return result.lastInsertRowid;
}

export async function updateService(id, tenantId, body) {
  const result = await db
    .prepare("UPDATE services SET name = ?, category_id = ?, duration = ?, price = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?")
    .run(body.name, body.categoryId, body.duration, body.price, body.active === false ? 0 : 1, id, tenantId);
  return result.changes;
}

export async function archiveService(id, tenantId) {
  const result = await db.prepare("UPDATE services SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?").run(id, tenantId);
  return result.changes;
}

export async function auditCatalog(userId, action, entity, entityId, tenantId) {
  await audit(userId, action, entity, entityId, { tenantId });
}
