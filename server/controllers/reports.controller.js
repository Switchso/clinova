import { json } from "../shared/http/json-response.js";
import { requirePermission } from "../services/permissions.service.js";
import { getReports } from "../services/reports.service.js";

export async function handleReportsRoute(req, res, url) {
  if (req.method !== "GET" || url.pathname !== "/api/reports") return false;

  const permission = await requirePermission(req, "reports");
  if (!permission.ok) {
    json(res, permission.status, permission.body);
    return true;
  }

  const result = await getReports(permission.user);
  json(res, result.status, result.body);
  return true;
}
