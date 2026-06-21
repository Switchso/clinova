import { listAuditRows } from "../repositories/audit.repository.js";

export async function getAuditLog(user) {
  const rows = await listAuditRows(user.tenantId);
  return {
    status: 200,
    body: rows.map((row) => ({
      ...row,
      details: JSON.parse(row.details || "{}"),
    })),
  };
}
