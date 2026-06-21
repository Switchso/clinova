import { json } from "../../shared/http/json-response.js";
import { requirePlatformOwner } from "../../services/permissions.service.js";
import { resetTenantAdminPassword } from "./platform-password.service.js";

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

export async function handlePlatformPasswordRoute(req, res, url) {
  const match = req.method === "POST" ? url.pathname.match(/^\/api\/platform\/tenants\/(\d+)\/reset-password$/) : null;
  if (!match) return false;

  const auth = await requirePlatformOwner(req);
  if (!auth.ok) {
    json(res, auth.status, auth.body);
    return true;
  }

  const result = await resetTenantAdminPassword(auth.user, Number(match[1]), await readBody(req));
  json(res, result.status, result.body);
  return true;
}
