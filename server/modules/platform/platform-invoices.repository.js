import { audit, db } from "../../db.js";
import { platformTenants } from "./platform.repository.js";

export async function tenantBillingForInvoice(tenantId) {
  const tenant = await db.prepare("SELECT id, plan FROM tenants WHERE id = ?").get(tenantId);
  const subscription = await db.prepare(`
    SELECT id, plan
    FROM subscriptions
    WHERE tenant_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(tenantId);
  return {
    tenant,
    subscription,
    plan: subscription?.plan || tenant?.plan || "starter",
  };
}

export async function createPlatformInvoice({ tenantId, subscriptionId, invoiceNumber, status, currency, amount, periodStart, periodEnd, dueAt, notes }) {
  const result = await db.prepare(`
    INSERT INTO billing_invoices (tenant_id, subscription_id, number, status, currency, amount, period_start, period_end, due_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(tenantId, subscriptionId, invoiceNumber, status, currency, amount, periodStart, periodEnd, dueAt, notes);
  return result.lastInsertRowid;
}

export async function findPlatformInvoice(invoiceId) {
  return db.prepare("SELECT id, tenant_id AS tenantId FROM billing_invoices WHERE id = ?").get(invoiceId);
}

export async function updatePlatformInvoiceStatus(invoiceId, status) {
  await db.prepare(`
    UPDATE billing_invoices
    SET status = ?, paid_at = CASE WHEN ? = 'paid' THEN CURRENT_TIMESTAMP ELSE paid_at END, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, status, invoiceId);
}

export async function auditPlatformInvoice(user, action, invoiceId, details) {
  await audit(user.id, action, "billing_invoices", invoiceId, details);
}

export { platformTenants };
