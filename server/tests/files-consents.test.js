import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { loginAs } from "./helpers/http-client.js";
import { startTestServer } from "./helpers/test-server.js";

const fixtureContent = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
  "utf8",
);

let testServer;
let removedRoot;
let fixturePath;

before(async () => {
  testServer = await startTestServer();
  removedRoot = testServer.root;
  const fixtureDir = join(testServer.root, "fixtures");
  fixturePath = join(fixtureDir, "safe-step-102-fixture.pdf");
  await mkdir(fixtureDir, { recursive: true });
  await writeFile(fixturePath, fixtureContent);
});

after(async () => {
  await testServer?.stop();
  await assert.rejects(access(removedRoot));
});

test("client file upload, list, download, and archive stay inside temporary uploads", async () => {
  const suffix = Date.now().toString(36);
  const { client, response: login } = await loginAs(testServer.baseUrl, "admin");
  assert.equal(login.status, 200);

  const bootstrap = await client.get("/api/bootstrap");
  const therapist = bootstrap.body.users.find((user) => user.username === "sara");
  assert.ok(therapist?.id);

  const createClient = await client.post("/api/clients", {
    body: {
      fname: "File",
      lname: `Fixture ${suffix}`,
      phone: "0500000102",
      email: `safe-step-102-${suffix}@example.test`,
      therapistId: therapist.id,
      notes: "Disposable file test client",
    },
  });
  assert.equal(createClient.status, 201);
  const clientId = createClient.body.id;

  assert.equal((await client.get(`/api/clients/${clientId}/files`)).status, 200);
  assert.equal((await client.post(`/api/clients/${clientId}/files`)).status, 400);

  const fixture = await readFile(fixturePath);
  const form = new FormData();
  form.append("name", "Safe Step 102 Client Fixture");
  form.append("notes", "Temporary upload fixture");
  form.append("file", new Blob([fixture], { type: "application/pdf" }), "safe-step-102-client.pdf");

  const upload = await client.post(`/api/clients/${clientId}/files`, { body: form });
  assert.equal(upload.status, 201);
  const fileId = upload.body.id;

  const files = await client.get(`/api/clients/${clientId}/files`);
  assert.equal(files.status, 200);
  const uploaded = files.body.find((item) => item.id === fileId);
  assert.equal(uploaded.name, "Safe Step 102 Client Fixture");
  assert.equal(uploaded.mimeType, "application/pdf");

  const download = await client.get(`/api/client-files/${fileId}/download`, { responseType: "buffer" });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), "application/pdf");
  assert.match(download.headers.get("content-disposition") || "", /^inline; filename\*=UTF-8''/);
  assert.ok(download.buffer.length > 0);
  assert.deepEqual(download.buffer, fixture);

  assert.equal((await client.delete(`/api/client-files/${fileId}`)).status, 200);
  assert.ok(!(await client.get(`/api/clients/${clientId}/files`)).body.some((item) => item.id === fileId));
  assert.equal((await client.get(`/api/client-files/${fileId}/download`)).status, 404);

  assert.equal((await client.delete(`/api/clients/${clientId}`)).status, 200);
});

test("consent PDF upload, list, download, invalid sign, and archive use temporary storage", async () => {
  const suffix = Date.now().toString(36);
  const { client, response: login } = await loginAs(testServer.baseUrl, "admin");
  assert.equal(login.status, 200);

  const categories = await client.get("/api/categories");
  assert.equal(categories.status, 200);
  assert.ok(categories.body[0]?.id);

  assert.equal((await client.get("/api/consents")).status, 200);
  assert.equal((await client.post("/api/consents")).status, 400);

  const fixture = await readFile(fixturePath);
  const form = new FormData();
  form.append("title", `SAFE_STEP_102_CONSENT_${suffix}`);
  form.append("categoryId", String(categories.body[0].id));
  form.append("file", new Blob([fixture], { type: "application/pdf" }), "safe-step-102-consent.pdf");

  const upload = await client.post("/api/consents", { body: form });
  assert.equal(upload.status, 201);
  const consentId = upload.body.id;

  const consents = await client.get("/api/consents");
  assert.equal(consents.status, 200);
  const consent = consents.body.find((item) => item.id === consentId);
  assert.equal(consent.title, `SAFE_STEP_102_CONSENT_${suffix}`);
  assert.equal(consent.mimeType, "application/pdf");

  const download = await client.get(`/api/consents/${consentId}/download`, { responseType: "buffer" });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), "application/pdf");
  assert.match(download.headers.get("content-disposition") || "", /^inline; filename\*=UTF-8''/);
  assert.ok(download.buffer.length > 0);
  assert.deepEqual(download.buffer, fixture);

  const invalidSign = await client.post(`/api/consents/${consentId}/sign`, {
    body: { signerName: "Safe Step 102", signatureData: "" },
  });
  assert.equal(invalidSign.status, 400);
  assert.equal(invalidSign.body.error, "Signature is required.");

  assert.equal((await client.delete(`/api/consents/${consentId}`)).status, 200);
  assert.ok(!(await client.get("/api/consents")).body.some((item) => item.id === consentId));
  assert.equal((await client.get(`/api/consents/${consentId}/download`)).status, 404);
});
