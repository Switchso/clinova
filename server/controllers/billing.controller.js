import { json } from "../shared/http/json-response.js";
import { apiNotFound } from "../shared/http/api-not-found.js";
import { requirePlatformOwner } from "../services/permissions.service.js";
import { addInvoice, editInvoice, getBilling, saveBilling } from "../services/billing.service.js";

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

export async function handleBillingRoute(req, res, url) {
  const permission = await requirePlatformOwner(req);
  if (!permission.ok) {
    json(res, permission.status, permission.body);
    return true;
  }

  if (url.pathname === "/api/billing" && req.method === "GET") {
    const result = await getBilling(permission.user);
    json(res, result.status, result.body);
    return true;
  }

  if (url.pathname === "/api/billing" && req.method === "PUT") {
    const result = await saveBilling(permission.user, await readBody(req));
    json(res, result.status, result.body);
    return true;
  }

  if (url.pathname === "/api/billing/invoices" && req.method === "POST") {
    const result = await addInvoice(permission.user, await readBody(req));
    json(res, result.status, result.body);
    return true;
  }

  if (url.pathname.startsWith("/api/billing/invoices/") && req.method === "PUT") {
    const invoiceId = Number(url.pathname.split("/").pop());
    const result = await editInvoice(permission.user, invoiceId, await readBody(req));
    json(res, result.status, result.body);
    return true;
  }

  if (url.pathname.startsWith("/api/billing")) {
    apiNotFound(res);
    return true;
  }

  return false;
}
