import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, test } from "node:test";
import { checkBackupFreshness } from "../shared/monitoring/backup-freshness.js";

const tempRoots = new Set();
const fixedNow = new Date("2035-01-02T12:00:00.000Z");

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "clinova-backup-freshness-test-"));
  tempRoots.add(root);
  return root;
}

async function writeBackup(dir, name, ageHours) {
  const path = join(dir, name);
  await writeFile(path, `backup ${name}`);
  const mtime = new Date(fixedNow.getTime() - ageHours * 60 * 60 * 1000);
  await import("node:fs/promises").then(({ utimes }) => utimes(path, mtime, mtime));
  return path;
}

afterEach(async () => {
  await Promise.all([...tempRoots].map((root) => rm(root, { recursive: true, force: true })));
  tempRoots.clear();
});

test("backup freshness reports missing for missing backup directory", async () => {
  const root = await tempRoot();
  const missingDir = join(root, "missing-backups");
  const result = await checkBackupFreshness({ backupDir: missingDir, now: fixedNow });

  assert.equal(result.ok, false);
  assert.equal(result.status, "missing");
  assert.equal(result.backupDir, resolve(missingDir));
  assert.equal(result.checkedAt, fixedNow.toISOString());
  assert.equal(result.maxAgeHours, 24);
});

test("backup freshness reports missing for empty backup directory", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);

  const result = await checkBackupFreshness({ backupDir, now: fixedNow });

  assert.equal(result.ok, false);
  assert.equal(result.status, "missing");
  assert.equal(result.message, "No backup files found.");
});

test("backup freshness reports fresh for backup within threshold", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  const backupPath = await writeBackup(backupDir, "clinova-sqlite-fresh.sqlite", 3);

  const result = await checkBackupFreshness({ backupDir, now: fixedNow, maxAgeHours: 24 });

  assert.equal(result.ok, true);
  assert.equal(result.status, "fresh");
  assert.equal(result.latestBackupPath, resolve(backupPath));
  assert.ok(result.latestBackupAgeHours >= 2.99 && result.latestBackupAgeHours <= 3.01);
});

test("backup freshness reports stale for backup older than threshold", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  const backupPath = await writeBackup(backupDir, "clinova-sqlite-stale.sqlite", 30);

  const result = await checkBackupFreshness({ backupDir, now: fixedNow, maxAgeHours: 24 });

  assert.equal(result.ok, false);
  assert.equal(result.status, "stale");
  assert.equal(result.latestBackupPath, resolve(backupPath));
  assert.ok(result.latestBackupAgeHours >= 29.99 && result.latestBackupAgeHours <= 30.01);
});

test("backup freshness chooses newest backup and ignores non-backup files", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writeFile(join(backupDir, "notes.txt"), "not a backup");
  await writeBackup(backupDir, "clinova-sqlite-old.sqlite", 12);
  const newest = await writeBackup(backupDir, "clinova-postgres-new.dump", 2);

  const result = await checkBackupFreshness({ backupDir, now: fixedNow, maxAgeHours: 6 });

  assert.equal(result.ok, true);
  assert.equal(result.status, "fresh");
  assert.equal(result.latestBackupPath, resolve(newest));
  assert.ok(result.latestBackupAgeHours >= 1.99 && result.latestBackupAgeHours <= 2.01);
});

test("backup freshness respects deterministic now and extension options", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writeBackup(backupDir, "ignored.sqlite", 1);
  const custom = await writeBackup(backupDir, "custom.backup", 10);

  const result = await checkBackupFreshness({
    backupDir,
    now: fixedNow,
    maxAgeHours: 11,
    includeExtensions: [".backup"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "fresh");
  assert.equal(result.latestBackupPath, resolve(custom));
  assert.ok(result.latestBackupAgeHours >= 9.99 && result.latestBackupAgeHours <= 10.01);
});
