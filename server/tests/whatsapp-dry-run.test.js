import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { after, before, test } from "node:test";
import { loginAs } from "./helpers/http-client.js";
import { startTestServer } from "./helpers/test-server.js";

let testServer;

before(async () => {
  testServer = await startTestServer({
    envOverrides: {
      WHATSAPP_ENABLED: "true",
      WHATSAPP_DRY_RUN: "true",
      WHATSAPP_PHONE_NUMBER_ID: "dummy-test-phone-number-id",
      WHATSAPP_ACCESS_TOKEN: "dummy-test-access-token",
    },
  });
});

after(async () => {
  await testServer?.stop();
});

function withDatabase(callback) {
  const sqlite = new DatabaseSync(testServer.databasePath);
  try {
    return callback(sqlite);
  } finally {
    sqlite.close();
  }
}

function enableProviderDryRunForTenant(tenantId = 1) {
  withDatabase((sqlite) => {
    sqlite.prepare("UPDATE tenants SET plan = ? WHERE id = ?").run("growth", tenantId);
    sqlite.prepare(`
      INSERT INTO subscriptions (tenant_id, provider, status, plan, current_period_end)
      VALUES (?, ?, ?, ?, ?)
    `).run(tenantId, "manual", "active", "growth", "2035-01-31T00:00:00.000Z");
    for (const [key, value] of [
      ["whatsappEnabled", "true"],
      ["whatsappMode", "provider"],
    ]) {
      sqlite.prepare(`
        INSERT INTO clinic_settings (tenant_id, key, value, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `).run(tenantId, key, value);
    }
  });
}

async function messageLogs(client) {
  const response = await client.get("/api/message-logs");
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.messageLogs));
  return response.body.messageLogs;
}

async function createDisposableAppointment(client, suffix) {
  const bootstrap = await client.get("/api/bootstrap");
  assert.equal(bootstrap.status, 200);
  const therapist = bootstrap.body.users.find((user) => user.username === "sara");
  assert.ok(therapist?.id);

  const category = await client.post("/api/categories", {
    body: { name: `WHATSAPP_DRY_RUN_CATEGORY_${suffix}` },
  });
  assert.equal(category.status, 201);

  const service = await client.post("/api/services", {
    body: {
      name: `WHATSAPP_DRY_RUN_SERVICE_${suffix}`,
      categoryId: category.body.id,
      duration: 30,
      price: 50,
    },
  });
  assert.equal(service.status, 201);

  const clientRow = await client.post("/api/clients", {
    body: {
      fname: "WhatsApp",
      lname: `Dry Run ${suffix}`,
      phone: "0500000141",
      email: `whatsapp-dry-run-${suffix}@example.test`,
      therapistId: therapist.id,
    },
  });
  assert.equal(clientRow.status, 201);

  const appointment = await client.post("/api/appointments", {
    body: {
      clientId: clientRow.body.id,
      serviceId: service.body.id,
      therapistId: therapist.id,
      date: "2032-02-15",
      time: "10:00",
      status: "pending",
    },
  });
  assert.equal(appointment.status, 201);

  return {
    appointmentId: appointment.body.id,
    categoryId: category.body.id,
    clientId: clientRow.body.id,
    serviceId: service.body.id,
  };
}

async function archiveDisposableAppointmentData(client, data) {
  await client.delete(`/api/appointments/${data.appointmentId}`);
  await client.delete(`/api/clients/${data.clientId}`);
  await client.delete(`/api/services/${data.serviceId}`);
  await client.delete(`/api/categories/${data.categoryId}`);
}

test("WhatsApp appointment send uses provider dry-run without fallback or network dependency", async () => {
  const suffix = Date.now().toString(36);
  enableProviderDryRunForTenant();
  const { client, response: login } = await loginAs(testServer.baseUrl, "admin");
  assert.equal(login.status, 200);

  const data = await createDisposableAppointment(client, suffix);
  const beforeLogs = await messageLogs(client);

  const send = await client.post(`/api/appointments/${data.appointmentId}/whatsapp`);
  assert.equal(send.status, 200);
  assert.equal(send.body.ok, true);
  assert.equal(send.body.dryRun, true);
  assert.notEqual(send.body.configured, false);
  assert.equal(send.body.payload?.messaging_product, "whatsapp");
  assert.equal(send.body.payload?.to, "972500000141");
  assert.match(send.body.fallbackUrl, /^https:\/\/wa\.me\//);
  assert.equal(send.body.messageId, undefined);

  const afterLogs = await messageLogs(client);
  assert.equal(afterLogs.length, beforeLogs.length + 1);
  assert.equal(afterLogs[0].status, "dry_run");
  assert.equal(afterLogs[0].entity, "appointments");
  assert.equal(afterLogs[0].entityId, data.appointmentId);
  assert.equal(afterLogs[0].providerMessageId, "");
  assert.equal(afterLogs[0].error, "");

  await archiveDisposableAppointmentData(client, data);
});

test("WhatsApp gift send uses provider dry-run without fallback or network dependency", async () => {
  const suffix = `${Date.now().toString(36)}-gift`;
  enableProviderDryRunForTenant();
  const { client, response: login } = await loginAs(testServer.baseUrl, "admin");
  assert.equal(login.status, 200);

  const data = await createDisposableAppointment(client, suffix);
  const gift = await client.post("/api/gifts", {
    body: {
      fromClientId: data.clientId,
      toClientId: data.clientId,
      serviceId: data.serviceId,
      sessions: 2,
      message: "Disposable dry-run WhatsApp gift",
    },
  });
  assert.equal(gift.status, 201);

  const beforeLogs = await messageLogs(client);
  const send = await client.post(`/api/gifts/${gift.body.id}/whatsapp`);
  assert.equal(send.status, 200);
  assert.equal(send.body.ok, true);
  assert.equal(send.body.dryRun, true);
  assert.notEqual(send.body.configured, false);
  assert.equal(send.body.payload?.messaging_product, "whatsapp");
  assert.equal(send.body.payload?.to, "972500000141");
  assert.match(send.body.fallbackUrl, /^https:\/\/wa\.me\//);
  assert.equal(send.body.messageId, undefined);

  const afterLogs = await messageLogs(client);
  assert.equal(afterLogs.length, beforeLogs.length + 1);
  assert.equal(afterLogs[0].status, "dry_run");
  assert.equal(afterLogs[0].entity, "gift_cards");
  assert.equal(afterLogs[0].entityId, gift.body.id);
  assert.equal(afterLogs[0].providerMessageId, "");
  assert.equal(afterLogs[0].error, "");

  await archiveDisposableAppointmentData(client, data);
});
