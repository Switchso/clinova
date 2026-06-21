import { json } from "../shared/http/json-response.js";
import { requirePermission } from "../services/permissions.service.js";
import { getAuditLog } from "../services/audit.service.js";

export async function handleAuditRoute(req, res, url) {
  if (req.method !== "GET" || url.pathname !== "/api/audit") return false;

  const permission = await requirePermission(req, "audit");
  if (!permission.ok) {
    json(res, permission.status, permission.body);
    return true;
  }

  const result = await getAuditLog(permission.user);
  json(res, result.status, result.body);
  return true;
}
