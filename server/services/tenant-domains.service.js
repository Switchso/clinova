import {
  auditTenantDomain,
  clearPrimaryDomains,
  createTenantDomain,
  deleteTenantDomain,
  findDomainByName,
  findTenantDomain,
  tenantDomains,
  updateTenantDomain,
} from "../repositories/tenant-domains.repository.js";

function normalizeDomain(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function validDomain(value) {
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(value) && !value.includes("..");
}

function primaryFlag(value) {
  return value === true || value === "true";
}

function hasExplicitValue(body, field) {
  return Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined && body[field] !== null && body[field] !== "";
}

export async function listTenantDomains(user) {
  return { status: 200, body: { domains: await tenantDomains(user.tenantId) } };
}

export async function addTenantDomain(user, body) {
  const domain = normalizeDomain(body.domain);
  if (!validDomain(domain)) return { status: 400, body: { error: "Valid domain is required." } };
  const existing = await findDomainByName(domain);
  if (existing) return { status: 409, body: { error: "Domain already exists." } };
  const makePrimary = primaryFlag(body.isPrimary);
  if (makePrimary) await clearPrimaryDomains(user.tenantId);
  const id = await createTenantDomain(user.tenantId, domain, makePrimary);
  await auditTenantDomain(user.id, "create", id, { tenantId: user.tenantId, domain });
  return { status: 201, body: { domains: await tenantDomains(user.tenantId), id } };
}

export async function editTenantDomain(user, id, body) {
  const current = await findTenantDomain(id, user.tenantId);
  if (!current) return { status: 404, body: { error: "Domain not found" } };
  if (hasExplicitValue(body, "status") && !["pending", "active", "failed", "disabled"].includes(body.status)) {
    return { status: 400, body: { error: "Valid domain status is required." } };
  }
  const status = ["pending", "active", "failed", "disabled"].includes(body.status) ? body.status : "pending";
  const makePrimary = primaryFlag(body.isPrimary);
  if (makePrimary) await clearPrimaryDomains(user.tenantId);
  await updateTenantDomain(id, user.tenantId, { status, makePrimary });
  await auditTenantDomain(user.id, "update", id, { tenantId: user.tenantId, status, isPrimary: makePrimary });
  return { status: 200, body: { domains: await tenantDomains(user.tenantId) } };
}

export async function removeTenantDomain(user, id) {
  const current = await findTenantDomain(id, user.tenantId);
  if (!current) return { status: 404, body: { error: "Domain not found" } };
  await deleteTenantDomain(id, user.tenantId);
  await auditTenantDomain(user.id, "delete", id, { tenantId: user.tenantId, domain: current.domain });
  return { status: 200, body: { domains: await tenantDomains(user.tenantId) } };
}
