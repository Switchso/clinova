import {
  auditBilling,
  createInvoice,
  createSubscription,
  invoiceById,
  latestSubscriptionId,
  planCatalog,
  tenantBilling,
  updateInvoiceStatus,
  updateSubscription,
  updateTenantPlanStatus,
} from "../repositories/billing.repository.js";
import { isValidIsoDate, isValidLocalDateTime } from "../shared/validation/date-time.js";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(dateText, days) {
  const date = new Date(`${dateText || todayIso()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function invoiceAmount(body, defaultAmount) {
  if (!Object.prototype.hasOwnProperty.call(body, "amount") || body.amount === null || body.amount === "") {
    return Number(defaultAmount || 0);
  }
  const validType = typeof body.amount === "number" || typeof body.amount === "string";
  if (!validType || (typeof body.amount === "string" && body.amount.trim() === "") || !Number.isFinite(Number(body.amount))) {
    return null;
  }
  return Number(body.amount);
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

export async function getBilling(user) {
  return { status: 200, body: { billing: await tenantBilling(user.tenantId) } };
}

export async function saveBilling(user, body) {
  const plan = planCatalog[body.plan] ? body.plan : "";
  const status = ["trial", "active", "past_due", "suspended", "cancelled"].includes(body.status) ? body.status : "";
  if (!plan || !status) return { status: 400, body: { error: "Valid plan and status are required." } };
  if (body.currentPeriodEnd !== undefined && body.currentPeriodEnd !== null && body.currentPeriodEnd !== ""
      && !isValidLocalDateTime(body.currentPeriodEnd) && !isValidIsoDate(body.currentPeriodEnd)) {
    return { status: 400, body: { error: "Valid current period end is required." } };
  }
  const currentPeriodEnd = body.currentPeriodEnd || null;
  const existing = await latestSubscriptionId(user.tenantId);
  if (existing) {
    await updateSubscription({ tenantId: user.tenantId, id: existing.id, plan, status, currentPeriodEnd });
  } else {
    await createSubscription({ tenantId: user.tenantId, plan, status, currentPeriodEnd });
  }
  await updateTenantPlanStatus(user.tenantId, plan, status);
  await auditBilling(user.id, "update_billing", "subscriptions", existing?.id || null, { tenantId: user.tenantId, plan, status });
  return { status: 200, body: { billing: await tenantBilling(user.tenantId) } };
}

export async function addInvoice(user, body) {
  const billing = await tenantBilling(user.tenantId);
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
  const invoiceId = await createInvoice({
    tenantId: user.tenantId,
    subscriptionId: billing.subscription?.id || null,
    number: invoiceNumber,
    status: body.status === "draft" ? "draft" : "open",
    currency,
    amount,
    periodStart,
    periodEnd,
    dueAt,
    notes: String(body.notes || ""),
  });
  await auditBilling(user.id, "create_invoice", "billing_invoices", invoiceId, { tenantId: user.tenantId, invoiceNumber, amount, currency });
  return { status: 201, body: { billing: await tenantBilling(user.tenantId), invoiceId } };
}

export async function editInvoice(user, invoiceId, body) {
  const status = ["draft", "open", "paid", "void", "uncollectible"].includes(body.status) ? body.status : "";
  if (!invoiceId || !status) return { status: 400, body: { error: "Valid invoice and status are required." } };
  const invoice = await invoiceById(invoiceId, user.tenantId);
  if (!invoice) return { status: 404, body: { error: "Invoice not found" } };
  await updateInvoiceStatus(invoiceId, user.tenantId, status);
  await auditBilling(user.id, "update_invoice", "billing_invoices", invoiceId, { tenantId: user.tenantId, status });
  return { status: 200, body: { billing: await tenantBilling(user.tenantId) } };
}
