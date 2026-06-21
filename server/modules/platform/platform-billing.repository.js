import { audit, db } from "../../db.js";

export async function autoBillingSubscriptions() {
  return db.prepare(`
    SELECT s.id, s.tenant_id AS tenantId, s.plan, s.status, COALESCE(s.billing_day, 1) AS billingDay,
           COALESCE(s.auto_billing_enabled, 0) AS autoBillingEnabled
    FROM subscriptions s
    JOIN tenants t ON t.id = s.tenant_id
    WHERE s.id = (SELECT id FROM subscriptions WHERE tenant_id = s.tenant_id ORDER BY id DESC LIMIT 1)
      AND COALESCE(s.auto_billing_enabled, 0) = 1
      AND s.status = 'active'
      AND t.status <> 'cancelled'
  `).all();
}

export async function invoiceByBillingCycle(tenantId, cycle) {
  return db.prepare("SELECT id FROM billing_invoices WHERE tenant_id = ? AND billing_cycle = ?").get(tenantId, cycle);
}

export async function createAutoBillingInvoice({ tenantId, subscriptionId, invoiceNumber, amount, periodStart, periodEnd, dueAt, cycle }) {
  const result = await db.prepare(`
    INSERT INTO billing_invoices (tenant_id, subscription_id, number, status, currency, amount, period_start, period_end, due_at, notes, billing_cycle)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(tenantId, subscriptionId, invoiceNumber, "open", "USD", amount, periodStart, periodEnd, dueAt, "Auto monthly billing", cycle);
  return result.lastInsertRowid;
}

export async function updateSubscriptionPeriodEnd(subscriptionId, periodEnd) {
  await db.prepare("UPDATE subscriptions SET current_period_end = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(periodEnd, subscriptionId);
}

export async function auditPlatformAutoBilling(user, runDate, result) {
  await audit(user.id, "platform_auto_billing_run", "billing_invoices", null, {
    tenantId: user.tenantId,
    runDate,
    created: result.created.length,
    skipped: result.skipped.length,
  });
}
