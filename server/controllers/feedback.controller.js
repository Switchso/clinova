import { json } from "../shared/http/json-response.js";
import { apiNotFound } from "../shared/http/api-not-found.js";
import { requirePermission } from "../services/permissions.service.js";
import { createFeedback, getFeedback, getPublicFeedback, submitFeedback } from "../services/feedback.service.js";

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

export async function handleFeedbackRoute(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts[1] === "public" && parts[2] === "feedback" && parts.length !== 4) {
    apiNotFound(res);
    return true;
  }

  if (parts[1] === "public" && parts[2] === "feedback" && parts.length === 4) {
    const token = parts[3];
    const result = req.method === "GET"
      ? await getPublicFeedback(token)
      : await submitFeedback(token, await readBody(req));
    json(res, result.status, result.body);
    return true;
  }

  if (url.pathname !== "/api/feedback") return false;
  const permission = await requirePermission(req, "feedback");
  if (!permission.ok) {
    json(res, permission.status, permission.body);
    return true;
  }

  if (req.method === "GET") {
    const result = await getFeedback(permission.user);
    json(res, result.status, result.body);
    return true;
  }

  if (req.method === "POST") {
    const result = await createFeedback(permission.user, await readBody(req), req);
    json(res, result.status, result.body);
    return true;
  }

  return false;
}
