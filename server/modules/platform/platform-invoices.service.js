import { planCatalog } from "./platform.repository.js";
import {
  auditPlatformInvoice,
  createPlatformInvoice,
  findPlatformInvoice,
  platformTenants,
  tenantBillingForInvoice,
  updatePlatformInvoiceStatus,
} from "./platform-invoices.repository.js";
import { isValidIsoDate } from "../../shared/validation/date-time.js";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(dateText, days) {
  const date = new Date(`${dateText || todayIso()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function invoiceAmount(body, defaultAmount) {
  if (!Object.prototype.hasOwnProperty.call(body, "amount")) return Number(defaultAmount || 0);
  const value = body.amount;
  const validType = typeof value === "number" || typeof value === "string";
  if (!validType || (typeof value === "string" && value.trim() === "") || !Number.isFinite(Number(value))) {
    return null;
  }
  return Number(value);
}

function hasExplicitValue(body, field) {
  return Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined && body[field] !== null && body[field] !== "";
}

function validOptionalInvoiceDates(body) {
  return ["periodStart", "periodEnd", "dueAt"].every((field) => {
    const value = body[field];
    return value === undefined || value === null || value === "" || isValidIsoDate(value);
  });
}

export async function createInvoice(user, tenantId, body) {
  const billing = await tenantBillingForInvoice(tenantId);
  if (!billing.tenant) return { status: 404, body: { error: "Tenant not found" } };

  const plan = planCatalog[body.plan] ? body.plan : billing.plan || "starter";
  const catalogItem = planCatalog[plan] || planCatalog.starter;
  const requestedAmount = invoiceAmount(body, catalogItem.monthlyPrice);
  if (requestedAmount === null) return { status: 400, body: { error: "Valid invoice amount is required." } };
  if (!validOptionalInvoiceDates(body)) return { status: 400, body: { error: "Valid invoice dates are required." } };
  if (hasExplicitValue(body, "status") && !["draft", "open"].includes(body.status)) {
    return { status: 400, body: { error: "Valid invoice status is required." } };
  }
  const periodStart = body.periodStart || todayIso();
  const periodEnd = body.periodEnd || addDaysIso(periodStart, 30);
  const dueAt = body.dueAt || addDaysIso(periodStart, 14);
  const amount = Math.max(0, requestedAmount);
  const currency = String(body.currency || "USD").trim().toUpperCase().slice(0, 3) || "USD";
  const invoiceNumber = `CLN-${new Date().getUTCFullYear()}-${String(Date.now()).slice(-8)}`;
  const invoiceId = await createPlatformInvoice({
    tenantId,
    subscriptionId: billing.subscription?.id || null,
    invoiceNumber,
    status: body.status === "draft" ? "draft" : "open",
    currency,
    amount,
    periodStart,
    periodEnd,
    dueAt,
    notes: String(body.notes || ""),
  });
  await auditPlatformInvoice(user, "platform_create_invoice", invoiceId, { tenantId: user.tenantId, targetTenantId: tenantId, invoiceNumber, amount, currency });
  return { status: 201, body: { tenants: await platformTenants(), invoiceId } };
}

export async function updateInvoice(user, invoiceId, body) {
  const status = ["draft", "open", "paid", "void", "uncollectible"].includes(body.status) ? body.status : "";
  if (!invoiceId || !status) return { status: 400, body: { error: "Valid invoice and status are required." } };
  const invoice = await findPlatformInvoice(invoiceId);
  if (!invoice) return { status: 404, body: { error: "Invoice not found" } };
  await updatePlatformInvoiceStatus(invoiceId, status);
  await auditPlatformInvoice(user, "platform_update_invoice", invoiceId, { tenantId: user.tenantId, targetTenantId: invoice.tenantId, status });
  return { status: 200, body: { tenants: await platformTenants() } };
}
