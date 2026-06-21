import { audit, db, provisionTenant } from "../../db.js";
import { platformTenants } from "./platform.repository.js";

export async function provisionPlatformTenant(values) {
  return provisionTenant(values);
}

export async function updateProvisionedSubscription(tenantId, plan, status) {
  await db.prepare("UPDATE subscriptions SET plan = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ?")
    .run(plan, status, tenantId);
}

export async function updateProvisionedTenant(tenantId, plan, status) {
  await db.prepare("UPDATE tenants SET plan = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(plan, status, tenantId);
}

export async function auditPlatformTenantCreate(user, tenantId, plan, status) {
  await audit(user.id, "platform_create_tenant", "tenants", tenantId, {
    tenantId: user.tenantId,
    targetTenantId: tenantId,
    plan,
    status,
  });
}

export { platformTenants };
