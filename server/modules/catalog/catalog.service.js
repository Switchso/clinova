import {
  archiveCategory,
  archiveService,
  archiveServicesByCategory,
  auditCatalog,
  createCategory,
  createService,
  listCategories,
  listServices,
  updateCategory,
  updateService,
} from "./catalog.repository.js";

function validNumber(value, { integer = false, min = null } = {}) {
  const validType = typeof value === "number" || typeof value === "string";
  if (!validType || (typeof value === "string" && value.trim() === "")) return false;
  const number = Number(value);
  return Number.isFinite(number)
    && (!integer || Number.isInteger(number))
    && (min === null || number >= min);
}

export async function getCategories(user) {
  return { status: 200, body: await listCategories(user.tenantId) };
}

export async function addCategory(user, body) {
  if (body.name === undefined || body.name === null) {
    return { status: 400, body: { error: "Category name is required." } };
  }

  const id = await createCategory(user.tenantId, body.name);
  await auditCatalog(user.id, "create", "categories", id, user.tenantId);
  return { status: 201, body: { id } };
}

export async function editCategory(user, id, body) {
  if (body.name === undefined || body.name === null || String(body.name).trim() === "") {
    return { status: 400, body: { error: "Category name is required." } };
  }

  const changes = await updateCategory(id, user.tenantId, body.name);
  if (!changes) return { status: 404, body: { error: "Category not found." } };
  await auditCatalog(user.id, "update", "categories", id, user.tenantId);
  return { status: 200, body: { ok: true } };
}

export async function removeCategory(user, id) {
  const changes = await archiveCategory(id, user.tenantId);
  if (!changes) return { status: 404, body: { error: "Category not found." } };
  await archiveServicesByCategory(id, user.tenantId);
  await auditCatalog(user.id, "archive", "categories", id, user.tenantId);
  return { status: 200, body: { ok: true } };
}

export async function getServices(user) {
  return { status: 200, body: await listServices(user.tenantId) };
}

export async function addService(user, body) {
  if (["name", "categoryId", "duration", "price"].some((field) => body[field] === undefined || body[field] === null)) {
    return { status: 400, body: { error: "Service name, category, duration, and price are required." } };
  }
  if (!validNumber(body.categoryId, { integer: true, min: 1 })
      || !validNumber(body.duration, { min: 1 })
      || !validNumber(body.price, { min: 0 })) {
    return { status: 400, body: { error: "Valid category, duration, and price are required." } };
  }

  const id = await createService(user.tenantId, body);
  await auditCatalog(user.id, "create", "services", id, user.tenantId);
  return { status: 201, body: { id } };
}

export async function editService(user, id, body) {
  if (["name", "categoryId", "duration", "price"].some((field) => body[field] === undefined || body[field] === null)
      || String(body.name).trim() === "") {
    return { status: 400, body: { error: "Service name, category, duration, and price are required." } };
  }
  if ((Object.prototype.hasOwnProperty.call(body, "categoryId") && !validNumber(body.categoryId, { integer: true, min: 1 }))
      || (Object.prototype.hasOwnProperty.call(body, "duration") && !validNumber(body.duration, { min: 1 }))
      || (Object.prototype.hasOwnProperty.call(body, "price") && !validNumber(body.price, { min: 0 }))) {
    return { status: 400, body: { error: "Valid category, duration, and price are required." } };
  }

  const changes = await updateService(id, user.tenantId, body);
  if (!changes) return { status: 404, body: { error: "Service not found." } };
  await auditCatalog(user.id, "update", "services", id, user.tenantId);
  return { status: 200, body: { ok: true } };
}

export async function removeService(user, id) {
  const changes = await archiveService(id, user.tenantId);
  if (!changes) return { status: 404, body: { error: "Service not found." } };
  await auditCatalog(user.id, "deactivate", "services", id, user.tenantId);
  return { status: 200, body: { ok: true } };
}
