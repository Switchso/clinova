import { requirePlatformOwnerCompat } from "../../shared/auth/permissions-compat.js";
import { json } from "../../shared/http/json-response.js";
import { auditSystemExport, createSystemExport, scheduleProcessExitAfterRestore, scheduleSystemRestore } from "./system.service.js";

export async function handleSystemRoute(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/system/export") {
    const user = await requirePlatformOwnerCompat(req, res);
    if (!user) return true;

    const exportData = createSystemExport();
    res.writeHead(200, exportData.headers);
    res.end(exportData.backup);
    await auditSystemExport(user);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/system/restore") {
    const user = await requirePlatformOwnerCompat(req, res);
    if (!user) return true;

    const result = await scheduleSystemRestore(req, user);
    if (!result.ok) {
      json(res, result.status, result.body);
      return true;
    }

    json(res, 200, result.body);
    scheduleProcessExitAfterRestore();
    return true;
  }

  return false;
}
