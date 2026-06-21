import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { loginAs } from "./helpers/http-client.js";
import { startTestServer } from "./helpers/test-server.js";

let testServer;

before(async () => {
  testServer = await startTestServer();
});

after(async () => {
  await testServer?.stop();
});

async function messageLogs(client) {
  const response = await client.get("/api/message-logs");
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.messageLogs));
  return response.body.messageLogs;
}

test("WhatsApp routes stay in no-real-send fallback mode and log only safe outcomes", async () => {
  const suffix = Date.now().toString(36);
  const { client, response: login } = await loginAs(testServer.baseUrl, "admin");
  assert.equal(login.status, 200);

  const initialLogs = await messageLogs(client);
  for (const log of initialLogs) {
    assert.equal(typeof log.id, "number");
    assert.equal(log.channel, "whatsapp");
    assert.equal(typeof log.status, "string");
  }

  const missingAppointment = await client.post("/api/appointments/999999/whatsapp");
  assert.equal(missingAppointment.status, 404);

  const missingGift = await client.post("/api/gifts/999999/whatsapp");
  assert.equal(missingGift.status, 404);
  assert.deepEqual(missingGift.body, { error: "Gift card not found." });

  const afterMissingLogs = await messageLogs(client);
  assert.equal(afterMissingLogs.length, initialLogs.length);

  const bootstrap = await client.get("/api/bootstrap");
  assert.equal(bootstrap.status, 200);
  const therapist = bootstrap.body.users.find((user) => user.username === "sara");
  assert.ok(therapist?.id);

  const category = await client.post("/api/categories", {
    body: { name: `WHATSAPP_NO_SEND_CATEGORY_${suffix}` },
  });
  assert.equal(category.status, 201);

  const service = await client.post("/api/services", {
    body: {
      name: `WHATSAPP_NO_SEND_SERVICE_${suffix}`,
      categoryId: category.body.id,
      duration: 30,
      price: 50,
    },
  });
  assert.equal(service.status, 201);

  const clientRow = await client.post("/api/clients", {
    body: {
      fname: "WhatsApp",
      lname: `No Send ${suffix}`,
      phone: "0500000139",
      email: `whatsapp-no-send-${suffix}@example.test`,
      therapistId: therapist.id,
    },
  });
  assert.equal(clientRow.status, 201);

  const appointment = await client.post("/api/appointments", {
    body: {
      clientId: clientRow.body.id,
      serviceId: service.body.id,
      therapistId: therapist.id,
      date: "2032-01-15",
      time: "10:00",
      status: "pending",
    },
  });
  assert.equal(appointment.status, 201);

  const appointmentSend = await client.post(`/api/appointments/${appointment.body.id}/whatsapp`);
  assert.equal(appointmentSend.status, 200);
  assert.equal(appointmentSend.body.ok, false);
  assert.equal(appointmentSend.body.configured, false);
  assert.match(appointmentSend.body.fallbackUrl, /^https:\/\/wa\.me\//);

  const afterAppointmentLogs = await messageLogs(client);
  assert.equal(afterAppointmentLogs.length, afterMissingLogs.length + 1);
  assert.equal(afterAppointmentLogs[0].status, "fallback");
  assert.equal(afterAppointmentLogs[0].entity, "appointments");
  assert.equal(afterAppointmentLogs[0].entityId, appointment.body.id);
  assert.equal(afterAppointmentLogs[0].providerMessageId, "");

  const gift = await client.post("/api/gifts", {
    body: {
      fromClientId: clientRow.body.id,
      toClientId: clientRow.body.id,
      serviceId: service.body.id,
      sessions: 2,
      message: "Disposable no-send WhatsApp gift",
    },
  });
  assert.equal(gift.status, 201);

  const giftSend = await client.post(`/api/gifts/${gift.body.id}/whatsapp`);
  assert.equal(giftSend.status, 200);
  assert.equal(giftSend.body.ok, false);
  assert.equal(giftSend.body.configured, false);
  assert.match(giftSend.body.fallbackUrl, /^https:\/\/wa\.me\//);

  const afterGiftLogs = await messageLogs(client);
  assert.equal(afterGiftLogs.length, afterAppointmentLogs.length + 1);
  assert.equal(afterGiftLogs[0].status, "fallback");
  assert.equal(afterGiftLogs[0].entity, "gift_cards");
  assert.equal(afterGiftLogs[0].entityId, gift.body.id);
  assert.equal(afterGiftLogs[0].providerMessageId, "");

  assert.equal((await client.delete(`/api/appointments/${appointment.body.id}`)).status, 200);
  assert.equal((await client.delete(`/api/clients/${clientRow.body.id}`)).status, 200);
  assert.equal((await client.delete(`/api/services/${service.body.id}`)).status, 200);
  assert.equal((await client.delete(`/api/categories/${category.body.id}`)).status, 200);
});
