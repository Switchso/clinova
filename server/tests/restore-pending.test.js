import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, test } from "node:test";
import { checkRestorePendingMarker } from "../shared/monitoring/restore-pending.js";

const tempRoots = new Set();
const fixedNow = new Date("2035-01-02T12:00:00.000Z");

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "clinova-restore-pending-test-"));
  tempRoots.add(root);
  return root;
}

async function writePendingSqlite(backupDir) {
  await writeFile(join(backupDir, "pending-restore.sqlite"), "sqlite fixture");
}

async function writePendingJson(backupDir, overrides = {}) {
  const metadata = {
    uploadedName: "restore.sqlite",
    source: join(backupDir, "restore-uploads", "restore.sqlite"),
    requestedBy: 1,
    safetyBackup: join(backupDir, "safety.sqlite"),
    createdAt: new Date(fixedNow.getTime() - 5 * 60 * 1000).toISOString(),
    ...overrides,
  };
  await writeFile(join(backupDir, "pending-restore.json"), JSON.stringify(metadata));
  return metadata;
}

afterEach(async () => {
  await Promise.all([...tempRoots].map((root) => rm(root, { recursive: true, force: true })));
  tempRoots.clear();
});

test("restore pending checker reports none when no pending files exist", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);

  const result = await checkRestorePendingMarker({ backupDir, now: fixedNow });

  assert.equal(result.ok, true);
  assert.equal(result.status, "none");
  assert.equal(result.backupDir, resolve(backupDir));
  assert.equal(result.pendingAgeMinutes, null);
  assert.equal(result.hasPendingSqlite, false);
  assert.equal(result.hasPendingJson, false);
});

test("restore pending checker reports pending when both markers are fresh", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writePendingSqlite(backupDir);
  await writePendingJson(backupDir);

  const result = await checkRestorePendingMarker({ backupDir, now: fixedNow, staleAfterMinutes: 30 });

  assert.equal(result.ok, false);
  assert.equal(result.status, "pending");
  assert.equal(result.hasPendingSqlite, true);
  assert.equal(result.hasPendingJson, true);
  assert.ok(result.pendingAgeMinutes >= 4.99 && result.pendingAgeMinutes <= 5.01);
  assert.equal(result.metadata.source, "restore.sqlite");
  assert.equal(result.metadata.safetyBackup, "safety.sqlite");
});

test("restore pending checker reports stale when both markers are older than threshold", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writePendingSqlite(backupDir);
  await writePendingJson(backupDir, {
    createdAt: new Date(fixedNow.getTime() - 45 * 60 * 1000).toISOString(),
  });

  const result = await checkRestorePendingMarker({ backupDir, now: fixedNow, staleAfterMinutes: 30 });

  assert.equal(result.ok, false);
  assert.equal(result.status, "stale");
  assert.ok(result.pendingAgeMinutes >= 44.99 && result.pendingAgeMinutes <= 45.01);
});

test("restore pending checker reports partial when only sqlite marker exists", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writePendingSqlite(backupDir);

  const result = await checkRestorePendingMarker({ backupDir, now: fixedNow });

  assert.equal(result.ok, false);
  assert.equal(result.status, "partial");
  assert.equal(result.hasPendingSqlite, true);
  assert.equal(result.hasPendingJson, false);
});

test("restore pending checker reports partial when only json marker exists", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writePendingJson(backupDir);

  const result = await checkRestorePendingMarker({ backupDir, now: fixedNow });

  assert.equal(result.ok, false);
  assert.equal(result.status, "partial");
  assert.equal(result.hasPendingSqlite, false);
  assert.equal(result.hasPendingJson, true);
});

test("restore pending checker reports invalid for invalid json", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writePendingSqlite(backupDir);
  await writeFile(join(backupDir, "pending-restore.json"), "{not json");

  const result = await checkRestorePendingMarker({ backupDir, now: fixedNow });

  assert.equal(result.ok, false);
  assert.equal(result.status, "invalid");
  assert.equal(result.message, "Pending restore metadata is invalid JSON.");
});

test("restore pending checker reports invalid when createdAt is missing", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writePendingSqlite(backupDir);
  await writePendingJson(backupDir, { createdAt: undefined });

  const result = await checkRestorePendingMarker({ backupDir, now: fixedNow });

  assert.equal(result.ok, false);
  assert.equal(result.status, "invalid");
  assert.equal(result.message, "Pending restore metadata is missing a valid createdAt timestamp.");
});

test("restore pending checker reports unreadable for missing backup directory", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "missing");

  const result = await checkRestorePendingMarker({ backupDir, now: fixedNow });

  assert.equal(result.ok, false);
  assert.equal(result.status, "unreadable");
  assert.equal(result.backupDir, resolve(backupDir));
});

test("restore pending checker respects deterministic now option", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writePendingSqlite(backupDir);
  await writePendingJson(backupDir, {
    createdAt: new Date(fixedNow.getTime() - 12 * 60 * 1000).toISOString(),
  });

  const result = await checkRestorePendingMarker({ backupDir, now: fixedNow, staleAfterMinutes: 30 });

  assert.ok(result.pendingAgeMinutes >= 11.99 && result.pendingAgeMinutes <= 12.01);
  assert.equal(result.checkedAt, fixedNow.toISOString());
});

test("restore pending checker hides paths by default", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writePendingSqlite(backupDir);
  await writePendingJson(backupDir);

  const result = await checkRestorePendingMarker({ backupDir, now: fixedNow });

  assert.equal(result.paths, undefined);
  assert.equal(result.metadata.source, "restore.sqlite");
  assert.equal(result.metadata.safetyBackup, "safety.sqlite");
});

test("restore pending checker shows paths only when enabled", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writePendingSqlite(backupDir);
  const metadata = await writePendingJson(backupDir);

  const result = await checkRestorePendingMarker({ backupDir, now: fixedNow, showPaths: true });

  assert.equal(result.paths.pendingSqlitePath, resolve(backupDir, "pending-restore.sqlite"));
  assert.equal(result.paths.pendingJsonPath, resolve(backupDir, "pending-restore.json"));
  assert.equal(result.metadata.source, metadata.source);
  assert.equal(result.metadata.safetyBackup, metadata.safetyBackup);
});
