import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loginAs } from "./helpers/http-client.js";
import { startTestServer } from "./helpers/test-server.js";

const preloadUrl = pathToFileURL(fileURLToPath(new URL("./helpers/mock-fetch-preload.js", import.meta.url))).href;
const startedServers = [];

after(async () => {
  await Promise.all(startedServers.map((server) => server.stop()));
});

async function startProviderFailureServer(mode) {
  const server = await startTestServer({
    envOverrides: {
      NODE_OPTIONS: `--import=${preloadUrl}`,
      WHATSAPP_ENABLED: "true",
      WHATSAPP_DRY_RUN: "false",
      WHATSAPP_PHONE_NUMBER_ID: "dummy-test-phone-number-id",
      WHATSAPP_ACCESS_TOKEN: "dummy-test-access-token",
      MOCK_FETCH_MODE: mode,
    },
  });
  startedServers.push(server);
  return server;
}

function withDatabase(server, callback) {
  const sqlite = new DatabaseSync(server.databasePath);
  try {
    return callback(sqlite);
  } finally {
    sqlite.close();
  }
}

function enableProviderModeForTenant(server, tenantId = 1) {
  withDatabase(server, (sqlite) => {
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
    body: { name: `WHATSAPP_HTTP_FAILURE_CATEGORY_${suffix}` },
  });
  assert.equal(category.status, 201);

  const service = await client.post("/api/services", {
    body: {
      name: `WHATSAPP_HTTP_FAILURE_SERVICE_${suffix}`,
      categoryId: category.body.id,
      duration: 30,
      price: 50,
    },
  });
  assert.equal(service.status, 201);

  const clientRow = await client.post("/api/clients", {
    body: {
      fname: "WhatsApp",
      lname: `HTTP Failure ${suffix}`,
      phone: "0500000146",
      email: `whatsapp-http-failure-${suffix}@example.test`,
      therapistId: therapist.id,
    },
  });
  assert.equal(clientRow.status, 201);

  const appointment = await client.post("/api/appointments", {
    body: {
      clientId: clientRow.body.id,
      serviceId: service.body.id,
      therapistId: therapist.id,
      date: "2032-04-15",
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

async function archiveDisposableData(client, data) {
  await client.delete(`/api/appointments/${data.appointmentId}`);
  await client.delete(`/api/clients/${data.clientId}`);
  await client.delete(`/api/services/${data.serviceId}`);
  await client.delete(`/api/categories/${data.categoryId}`);
}

function assertFailedLog(log, entity, entityId, errorMessage) {
  assert.equal(log.status, "failed");
  assert.equal(log.entity, entity);
  assert.equal(log.entityId, entityId);
  assert.equal(log.providerMessageId, "");
  assert.match(log.fallbackUrl, /^https:\/\/wa\.me\//);
  assert.equal(log.error, errorMessage);
}

async function sendAppointmentWithProviderFailure(mode, expectedStatus, expectedError) {
  const server = await startProviderFailureServer(mode);
  enableProviderModeForTenant(server);
  const { client, response: login } = await loginAs(server.baseUrl, "admin");
  assert.equal(login.status, 200);

  const data = await createDisposableAppointment(client, `${Date.now().toString(36)}-${mode}`);
  try {
    const beforeLogs = await messageLogs(client);
    const response = await client.post(`/api/appointments/${data.appointmentId}/whatsapp`);
    assert.equal(response.status, expectedStatus);
    assert.deepEqual(response.body, { error: expectedError });

    const afterLogs = await messageLogs(client);
    assert.equal(afterLogs.length, beforeLogs.length + 1);
    assertFailedLog(afterLogs[0], "appointments", data.appointmentId, expectedError);
  } finally {
    await archiveDisposableData(client, data);
  }
}

test("WhatsApp appointment provider 400 failure returns controlled error and failed log", async () => {
  await sendAppointmentWithProviderFailure("provider_400", 400, "Mock WhatsApp provider 400");
});

test("WhatsApp appointment provider 500 failure returns controlled error and failed log", async () => {
  await sendAppointmentWithProviderFailure("provider_500", 500, "Mock WhatsApp provider 500");
});

test("WhatsApp appointment provider network exception returns current 500 and failed log", async () => {
  await sendAppointmentWithProviderFailure("network_error", 500, "Mock WhatsApp provider network error");
});

test("WhatsApp gift provider 400 failure returns controlled error and failed log", async () => {
  const server = await startProviderFailureServer("provider_400");
  enableProviderModeForTenant(server);
  const { client, response: login } = await loginAs(server.baseUrl, "admin");
  assert.equal(login.status, 200);

  const data = await createDisposableAppointment(client, `${Date.now().toString(36)}-gift-400`);
  try {
    const gift = await client.post("/api/gifts", {
      body: {
        fromClientId: data.clientId,
        toClientId: data.clientId,
        serviceId: data.serviceId,
        sessions: 2,
        message: "Disposable HTTP failure WhatsApp gift",
      },
    });
    assert.equal(gift.status, 201);

    const beforeLogs = await messageLogs(client);
    const response = await client.post(`/api/gifts/${gift.body.id}/whatsapp`);
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, { error: "Mock WhatsApp provider 400" });

    const afterLogs = await messageLogs(client);
    assert.equal(afterLogs.length, beforeLogs.length + 1);
    assertFailedLog(afterLogs[0], "gift_cards", gift.body.id, "Mock WhatsApp provider 400");
  } finally {
    await archiveDisposableData(client, data);
  }
});
