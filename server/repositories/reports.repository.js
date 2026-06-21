import { db } from "../db.js";

export async function listReportAppointmentRows(tenantId) {
  return await db.prepare(`
    SELECT a.status, a.date, s.price, s.name AS service_name, u.name AS therapist_name
    FROM appointments a
    JOIN services s ON s.id = a.service_id
    JOIN users u ON u.id = a.therapist_id
    WHERE a.tenant_id = ? AND a.active = 1
  `).all(tenantId);
}
