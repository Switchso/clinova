export function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id || 1,
    username: row.username,
    email: row.email || "",
    name: row.name,
    title: row.title,
    role: row.role,
    workdays: JSON.parse(row.workdays || "[]"),
    serviceIds: JSON.parse(row.service_ids || "[]"),
    platformOwner: Boolean(row.is_platform_owner),
    active: Boolean(row.active),
  };
}
