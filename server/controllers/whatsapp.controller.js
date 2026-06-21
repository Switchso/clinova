import { json } from "../shared/http/json-response.js";
import { requirePermission } from "../services/permissions.service.js";
import { getMessageLogs, sendAppointmentReminder, sendGiftWhatsApp } from "../services/whatsapp.service.js";

export async function handleWhatsAppRoute(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/message-logs") {
    const permission = await requirePermission(req, "feedback");
    if (!permission.ok) {
      json(res, permission.status, permission.body);
      return true;
    }
    const result = await getMessageLogs(permission.user);
    json(res, result.status, result.body);
    return true;
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const resource = parts[1];
  const id = parts[2] ? Number(parts[2]) : null;

  if (req.method === "POST" && resource === "appointments" && id && parts[3] === "whatsapp") {
    const permission = await requirePermission(req, "appointments_write");
    if (!permission.ok) {
      json(res, permission.status, permission.body);
      return true;
    }
    const result = await sendAppointmentReminder(permission.user, id);
    json(res, result.status, result.body);
    return true;
  }

  if (req.method === "POST" && resource === "gifts" && id && parts[3] === "whatsapp") {
    const permission = await requirePermission(req, "gifts");
    if (!permission.ok) {
      json(res, permission.status, permission.body);
      return true;
    }
    const result = await sendGiftWhatsApp(permission.user, id);
    json(res, result.status, result.body);
    return true;
  }

  return false;
}
