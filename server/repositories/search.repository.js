import { db } from "../db.js";

export async function listClientRowsForSearch(user) {
  const sql = user.role === "therapist"
    ? "SELECT c.*, u.name AS therapistName FROM clients c LEFT JOIN users u ON u.id = c.therapist_id WHERE c.tenant_id = ? AND c.active = 1 AND c.therapist_id = ? ORDER BY c.updated_at DESC LIMIT 80"
    : "SELECT c.*, u.name AS therapistName FROM clients c LEFT JOIN users u ON u.id = c.therapist_id WHERE c.tenant_id = ? AND c.active = 1 ORDER BY c.updated_at DESC LIMIT 120";
  return user.role === "therapist"
    ? await db.prepare(sql).all(user.tenantId, user.id)
    : await db.prepare(sql).all(user.tenantId);
}

export async function listAppointmentRowsForSearch(user, like, digitTerm) {
  const base = `
    SELECT a.id, a.date, a.time, a.status, a.payment_status AS paymentStatus,
           c.id AS clientId, c.fname || ' ' || c.lname AS clientName, c.phone AS clientPhone,
           s.name AS serviceName, u.name AS therapistName
    FROM appointments a
    JOIN clients c ON c.id = a.client_id
    JOIN services s ON s.id = a.service_id
    JOIN users u ON u.id = a.therapist_id
    WHERE a.tenant_id = ? AND a.active = 1 AND (c.fname LIKE ? OR c.lname LIKE ? OR c.phone LIKE ? OR REPLACE(c.phone, '-', '') LIKE ? OR s.name LIKE ? OR u.name LIKE ? OR a.date LIKE ? OR a.status LIKE ? OR a.payment_status LIKE ?)
  `;
  return user.role === "therapist"
    ? await db.prepare(`${base} AND a.therapist_id = ? ORDER BY a.date DESC, a.time DESC LIMIT 10`)
      .all(user.tenantId, like, like, like, digitTerm, like, like, like, like, like, user.id)
    : await db.prepare(`${base} ORDER BY a.date DESC, a.time DESC LIMIT 10`)
      .all(user.tenantId, like, like, like, digitTerm, like, like, like, like, like);
}

export async function listServiceRowsForSearch(user, like) {
  if (user.role !== "admin" && user.role !== "reception") return [];
  return await db.prepare(`
    SELECT s.id, s.name, s.duration, s.price, c.name AS categoryName
    FROM services s
    JOIN categories c ON c.id = s.category_id
    WHERE s.tenant_id = ? AND s.active = 1 AND (s.name LIKE ? OR c.name LIKE ?)
    ORDER BY s.name
    LIMIT 8
  `).all(user.tenantId, like, like);
}
