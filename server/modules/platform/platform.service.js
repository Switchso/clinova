import {
  auditPlatformTenantUpdate,
  createSubscription,
  findTenant,
  latestSubscription,
  planCatalog,
  platformTenants,
  updateSubscription,
  updateTenantPlanStatus,
} from "./platform.repository.js";

function validOptionalNumber(value) {
  if (value === undefined || value === null || value === "") return true;
  const validType = typeof value === "number" || typeof value === "string";
  return validType && !(typeof value === "string" && value.trim() === "") && Number.isFinite(Number(value));
}

export async function getPlatformTenants() {
  return { status: 200, body: { tenants: await platformTenants() } };
}

export async function updatePlatformTenant(user, tenantId, body) {
  const plan = planCatalog[body.plan] ? body.plan : "";
  const status = ["trial", "active", "past_due", "suspended", "cancelled"].includes(body.status) ? body.status : "";
  if (!validOptionalNumber(body.billingDay)) return { status: 400, body: { error: "Valid billing day is required." } };
  const billingDay = Math.min(Math.max(Number(body.billingDay || 1), 1), 31);
  const autoBillingEnabled = body.autoBillingEnabled === true || body.autoBillingEnabled === "true" || body.autoBillingEnabled === "on";
  if (!tenantId || !plan || !status) return { status: 400, body: { error: "Valid tenant, plan, and status are required." } };

  const tenant = await findTenant(tenantId);
  if (!tenant) return { status: 404, body: { error: "Tenant not found" } };

  const existing = await latestSubscription(tenantId);
  if (existing) {
    await updateSubscription(existing.id, tenantId, { plan, status, billingDay, autoBillingEnabled });
  } else {
    await createSubscription(tenantId, { plan, status, billingDay, autoBillingEnabled });
  }

  await updateTenantPlanStatus(tenantId, plan, status);
  await auditPlatformTenantUpdate(user, tenantId, plan, status);
  return { status: 200, body: { tenants: await platformTenants() } };
}
