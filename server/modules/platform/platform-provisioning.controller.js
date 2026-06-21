import { json } from "../../shared/http/json-response.js";
import { requirePlatformOwner } from "../../services/permissions.service.js";
import { createPlatformTenant } from "./platform-provisioning.service.js";

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

export async function handlePlatformProvisioningRoute(req, res, url) {
  if (req.method !== "POST" || url.pathname !== "/api/platform/tenants") return false;

  const auth = await requirePlatformOwner(req);
  if (!auth.ok) {
    json(res, auth.status, auth.body);
    return true;
  }

  const result = await createPlatformTenant(auth.user, await readBody(req));
  json(res, result.status, result.body);
  return true;
}
