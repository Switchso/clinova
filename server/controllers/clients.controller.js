import { json } from "../shared/http/json-response.js";
import { apiNotFound } from "../shared/http/api-not-found.js";
import { requirePermission } from "../services/permissions.service.js";
import { addClient, editClient, getClientHistory, getClients, removeClient } from "../services/clients.service.js";

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

export async function handleClientsRoute(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[2] && !/^\d+$/.test(parts[2])) {
    apiNotFound(res);
    return true;
  }
  const id = parts[2] ? Number(parts[2]) : null;

  if (id && parts[3] && parts[3] !== "history") {
    apiNotFound(res);
    return true;
  }

  const permissionKey = req.method === "GET" ? "clients_read" : "clients_write";
  const permission = await requirePermission(req, permissionKey);
  if (!permission.ok) {
    json(res, permission.status, permission.body);
    return true;
  }

  if (req.method === "GET" && id && parts[3] === "history") {
    const result = await getClientHistory(permission.user, id);
    json(res, result.status, result.body);
    return true;
  }

  if (req.method === "GET" && !id) {
    const result = await getClients(permission.user);
    json(res, result.status, result.body);
    return true;
  }

  if (req.method === "POST" && !id) {
    const result = await addClient(permission.user, await readBody(req));
    json(res, result.status, result.body);
    return true;
  }

  if (req.method === "PUT" && id) {
    const result = await editClient(permission.user, id, await readBody(req));
    json(res, result.status, result.body);
    return true;
  }

  if (req.method === "DELETE" && id) {
    const result = await removeClient(permission.user, id);
    json(res, result.status, result.body);
    return true;
  }

  return false;
}
