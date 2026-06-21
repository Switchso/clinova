import { json } from "../shared/http/json-response.js";
import { apiNotFound } from "../shared/http/api-not-found.js";
import { requirePermission } from "../services/permissions.service.js";
import {
  acceptInvitation,
  createInvitation,
  deleteInvitation,
  listInvitations,
  previewInvitation,
} from "../services/invitations.service.js";

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

function invitationToken(url) {
  return url.pathname.split("/")[3];
}

export async function handleInvitationsRoute(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts[1] === "invitations" && parts.length > 3 && !(req.method === "POST" && parts.length === 4 && parts[3] === "accept")) {
    apiNotFound(res);
    return true;
  }

  if (req.method === "GET" && parts[1] === "invitations" && parts.length === 3) {
    const result = await previewInvitation(url.pathname.split("/").pop());
    json(res, result.status, result.body);
    return true;
  }

  if (req.method === "POST" && parts[1] === "invitations" && parts.length === 4 && parts[3] === "accept") {
    const result = await acceptInvitation(invitationToken(url), await readBody(req));
    if (result.cookie) res.setHeader("Set-Cookie", result.cookie);
    json(res, result.status, result.body);
    return true;
  }

  const permission = await requirePermission(req, "users");
  if (!permission.ok) {
    json(res, permission.status, permission.body);
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/invitations") {
    const result = await listInvitations(permission.user, req);
    json(res, result.status, result.body);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/invitations") {
    const result = await createInvitation(permission.user, await readBody(req), req);
    json(res, result.status, result.body);
    return true;
  }

  if (req.method === "DELETE" && parts[1] === "invitations" && parts.length === 3) {
    const invitationId = Number(url.pathname.split("/").pop());
    const result = await deleteInvitation(permission.user, invitationId);
    json(res, result.status, result.body);
    return true;
  }

  return false;
}
