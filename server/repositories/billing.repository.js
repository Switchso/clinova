import { audit, db } from "../db.js";

export const planCatalog = {
  starter: { name: "Starter", monthlyPrice: 49, maxUsers: 5, maxClients: 200, whatsapp: false, billing: false },
  growth: { name: "Growth", monthlyPrice: 99, maxUsers: 10, maxClients: 2000, whatsapp: true, billing: false },
  scale: { name: "Scale", monthlyPrice: 199, maxUsers: null, maxClients: null, whatsapp: true, billing: true },
};

function planLimits(plan) {
  return planCatalog[plan] || planCatalog.starter;
}

export async function tenantBilling(tenantId) {
  const tenant = await db.prepare("SELECT id, name, slug, status, plan, billing_email AS billingEmail, trial_ends_at AS trialEndsAt FROM tenants WHERE id = ?").get(tenantId);
  const subscription = await db.prepare(`
    SELECT id, provider, provider_customer_id AS providerCustomerId, provider_subscription_id AS providerSubscriptionId,
           status, plan, current_period_end AS currentPeriodEnd, created_at AS createdAt, updated_at AS updatedAt
    FROM subscriptions
    WHERE tenant_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(tenantId);
  const plan = subscription?.plan || tenant?.plan || "starter";
  const usage = {
    users: Number((await db.prepare("SELECT COUNT(*) AS count FROM users WHERE tenant_id = ? AND active = 1 AND COALESCE(is_platform_owner, 0) = 0").get(tenantId)).count || 0),
    clients: Number((await db.prepare("SELECT COUNT(*) AS count FROM clients WHERE tenant_id = ? AND active = 1").get(tenantId)).count || 0),
  };
  const invoices = await db.prepare(`
    SELECT id, number, status, currency, amount, period_start AS periodStart, period_end AS periodEnd,
           due_at AS dueAt, paid_at AS paidAt, notes, created_at AS createdAt, updated_at AS updatedAt
    FROM billing_invoices
    WHERE tenant_id = ?
    ORDER BY id DESC
    LIMIT 12
  `).all(tenantId);
  return {
    tenant,
    subscription,
    plan,
    status: subscription?.status || tenant?.status || "trial",
    limits: planLimits(plan),
    usage,
    invoices,
    catalog: planCatalog,
  };
}

export async function latestSubscriptionId(tenantId) {
  return await db.prepare("SELECT id FROM subscriptions WHERE tenant_id = ? ORDER BY id DESC LIMIT 1").get(tenantId);
}

export async function updateSubscription({ tenantId, id, plan, status, currentPeriodEnd }) {
  await db.prepare("UPDATE subscriptions SET plan = ?, status = ?, current_period_end = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?")
    .run(plan, status, currentPeriodEnd, id, tenantId);
}

export async function createSubscription({ tenantId, plan, status, currentPeriodEnd }) {
  const result = await db.prepare("INSERT INTO subscriptions (tenant_id, provider, status, plan, current_period_end) VALUES (?, ?, ?, ?, ?)")
    .run(tenantId, "manual", status, plan, currentPeriodEnd);
  return result.lastInsertRowid;
}

export async function updateTenantPlanStatus(tenantId, plan, status) {
  await db.prepare("UPDATE tenants SET plan = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(plan, status, tenantId);
}

export async function createInvoice({ tenantId, subscriptionId, number, status, currency, amount, periodStart, periodEnd, dueAt, notes }) {
  const result = await db.prepare(`
    INSERT INTO billing_invoices (tenant_id, subscription_id, number, status, currency, amount, period_start, period_end, due_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(tenantId, subscriptionId, number, status, currency, amount, periodStart, periodEnd, dueAt, notes);
  return result.lastInsertRowid;
}

export async function invoiceById(invoiceId, tenantId) {
  return await db.prepare("SELECT id FROM billing_invoices WHERE id = ? AND tenant_id = ?").get(invoiceId, tenantId);
}

export async function updateInvoiceStatus(invoiceId, tenantId, status) {
  await db.prepare(`
    UPDATE billing_invoices
    SET status = ?, paid_at = CASE WHEN ? = 'paid' THEN CURRENT_TIMESTAMP ELSE paid_at END, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ?
  `).run(status, status, invoiceId, tenantId);
}

export async function auditBilling(userId, action, entity, entityId, details) {
  await audit(userId, action, entity, entityId, details);
}
