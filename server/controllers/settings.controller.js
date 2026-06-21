import { json } from "../shared/http/json-response.js";
import { requirePermission, requirePlatformOwner, requireUser } from "../services/permissions.service.js";
import { getSettings, getTenant, saveSettings, saveTenant } from "../services/settings.service.js";

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Invalid JSON body");
    error.status = 400;
    throw error;
  }
}

export async function handleSettingsRoute(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/settings") {
    const auth = await requireUser(req);
    if (!auth.ok) {
      json(res, auth.status, auth.body);
      return true;
    }
    const result = await getSettings(auth.user);
    json(res, result.status, result.body);
    return true;
  }

  if (req.method === "PUT" && url.pathname === "/api/settings") {
    const auth = await requirePermission(req, "settings_write");
    if (!auth.ok) {
      json(res, auth.status, auth.body);
      return true;
    }
    const result = await saveSettings(auth.user, await readBody(req));
    json(res, result.status, result.body);
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/tenant") {
    const auth = await requireUser(req);
    if (!auth.ok) {
      json(res, auth.status, auth.body);
      return true;
    }
    const result = await getTenant(auth.user);
    json(res, result.status, result.body);
    return true;
  }

  if (req.method === "PUT" && url.pathname === "/api/tenant") {
    const auth = await requirePlatformOwner(req);
    if (!auth.ok) {
      json(res, auth.status, auth.body);
      return true;
    }
    const result = await saveTenant(auth.user, await readBody(req));
    json(res, result.status, result.body);
    return true;
  }

  return false;
}
