import { planCatalog, platformTenants } from "./platform.repository.js";
import {
  auditPlatformAutoBilling,
  autoBillingSubscriptions,
  createAutoBillingInvoice,
  invoiceByBillingCycle,
  updateSubscriptionPeriodEnd,
} from "./platform-billing.repository.js";
import { isValidIsoDate } from "../../shared/validation/date-time.js";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(dateText, days) {
  const date = new Date(`${dateText || todayIso()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function addMonthsIso(dateText, months = 1) {
  const date = new Date(`${dateText || todayIso()}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + Number(months || 0));
  return date.toISOString().slice(0, 10);
}

function clampBillingDay(year, monthIndex, day) {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return Math.min(Math.max(Number(day || 1), 1), lastDay);
}

function billingDateForMonth(dateText, billingDay) {
  const date = new Date(`${dateText || todayIso()}T00:00:00.000Z`);
  const day = clampBillingDay(date.getUTCFullYear(), date.getUTCMonth(), billingDay);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function billingCycleKey(dateText) {
  return String(dateText || todayIso()).slice(0, 7);
}

export async function runAutomaticBilling(runDate = todayIso()) {
  const cycle = billingCycleKey(runDate);
  const subscriptions = await autoBillingSubscriptions();
  const created = [];
  const skipped = [];

  for (const subscription of subscriptions) {
    const billingDate = billingDateForMonth(runDate, subscription.billingDay);
    if (runDate < billingDate) {
      skipped.push({ tenantId: subscription.tenantId, reason: "not_due", billingDate });
      continue;
    }
    const existing = await invoiceByBillingCycle(subscription.tenantId, cycle);
    if (existing) {
      skipped.push({ tenantId: subscription.tenantId, reason: "exists", invoiceId: existing.id });
      continue;
    }
    const catalogItem = planCatalog[subscription.plan] || planCatalog.starter;
    const amount = Number(catalogItem.monthlyPrice || 0);
    const periodStart = billingDate;
    const periodEnd = addMonthsIso(periodStart, 1);
    const dueAt = addDaysIso(periodStart, 14);
    const invoiceNumber = `CLN-${new Date().getUTCFullYear()}-${String(Date.now()).slice(-8)}-${subscription.tenantId}`;
    const invoiceId = await createAutoBillingInvoice({
      tenantId: subscription.tenantId,
      subscriptionId: subscription.id,
      invoiceNumber,
      amount,
      periodStart,
      periodEnd,
      dueAt,
      cycle,
    });
    await updateSubscriptionPeriodEnd(subscription.id, periodEnd);
    created.push({ tenantId: subscription.tenantId, invoiceId, invoiceNumber, amount, cycle });
  }

  return { runDate, cycle, created, skipped };
}

export async function runPlatformAutoBilling(user, body) {
  const runDate = body.runDate || todayIso();
  if (!isValidIsoDate(runDate)) return { status: 400, body: { error: "Valid run date is required." } };
  const result = await runAutomaticBilling(runDate);
  await auditPlatformAutoBilling(user, runDate, result);
  return { status: 200, body: { tenants: await platformTenants(), result } };
}
