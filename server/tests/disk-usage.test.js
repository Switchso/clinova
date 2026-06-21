import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, test } from "node:test";
import {
  analyzeDiskUsagePaths,
  getDirectorySizeBytes,
} from "../shared/monitoring/disk-usage.js";

const tempRoots = new Set();
const fixedNow = new Date("2035-01-02T12:00:00.000Z");

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "clinova-disk-usage-test-"));
  tempRoots.add(root);
  return root;
}

afterEach(async () => {
  await Promise.all([...tempRoots].map((root) => rm(root, { recursive: true, force: true })));
  tempRoots.clear();
});

test("disk usage reports empty directory as healthy", async () => {
  const root = await tempRoot();
  const uploads = join(root, "uploads");
  await mkdir(uploads);

  const result = await analyzeDiskUsagePaths([{ label: "uploads", path: uploads }], { now: fixedNow });

  assert.equal(result.ok, true);
  assert.equal(result.status, "healthy");
  assert.equal(result.paths[0].sizeBytes, 0);
  assert.equal(result.paths[0].sizeMb, 0);
});

test("directory size counts nested files correctly", async () => {
  const root = await tempRoot();
  const uploads = join(root, "uploads");
  await mkdir(join(uploads, "nested"), { recursive: true });
  await writeFile(join(uploads, "one.bin"), Buffer.alloc(7));
  await writeFile(join(uploads, "nested", "two.bin"), Buffer.alloc(13));

  assert.equal(await getDirectorySizeBytes(uploads), 20);
});

test("directory size counts multiple nested directories", async () => {
  const root = await tempRoot();
  const data = join(root, "data");
  await mkdir(join(data, "a"), { recursive: true });
  await mkdir(join(data, "b", "c"), { recursive: true });
  await writeFile(join(data, "a", "one.bin"), Buffer.alloc(3));
  await writeFile(join(data, "b", "two.bin"), Buffer.alloc(5));
  await writeFile(join(data, "b", "c", "three.bin"), Buffer.alloc(11));

  assert.equal(await getDirectorySizeBytes(data), 19);
});

test("disk usage supports measuring a single file", async () => {
  const root = await tempRoot();
  const database = join(root, "clinic.sqlite");
  await writeFile(database, Buffer.alloc(32));

  const result = await analyzeDiskUsagePaths([{ label: "database", path: database }], { now: fixedNow });

  assert.equal(result.paths[0].exists, true);
  assert.equal(result.paths[0].sizeBytes, 32);
  assert.equal(result.paths[0].status, "healthy");
});

test("disk usage classifies warning threshold inclusively", async () => {
  const root = await tempRoot();
  const logs = join(root, "logs");
  await mkdir(logs);
  await writeFile(join(logs, "app.log"), Buffer.alloc(10));

  const result = await analyzeDiskUsagePaths([{ label: "logs", path: logs }], {
    now: fixedNow,
    warningBytes: 10,
    criticalBytes: 20,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "warning");
  assert.equal(result.paths[0].status, "warning");
});

test("disk usage classifies critical threshold inclusively", async () => {
  const root = await tempRoot();
  const backups = join(root, "backups");
  await mkdir(backups);
  await writeFile(join(backups, "backup.sqlite"), Buffer.alloc(20));

  const result = await analyzeDiskUsagePaths([{ label: "backups", path: backups }], {
    now: fixedNow,
    warningBytes: 10,
    criticalBytes: 20,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "critical");
  assert.equal(result.paths[0].status, "critical");
});

test("disk usage reports missing directory", async () => {
  const root = await tempRoot();
  const missing = join(root, "missing");

  const result = await analyzeDiskUsagePaths([{ label: "missing", path: missing }], { now: fixedNow });

  assert.equal(result.ok, false);
  assert.equal(result.status, "missing");
  assert.equal(result.paths[0].exists, false);
  assert.equal(result.paths[0].sizeBytes, null);
});

test("disk usage uses deterministic checkedAt", async () => {
  const root = await tempRoot();

  const result = await analyzeDiskUsagePaths([{ label: "root", path: root }], { now: fixedNow });

  assert.equal(result.checkedAt, fixedNow.toISOString());
});

test("disk usage hides paths by default and shows them only when requested", async () => {
  const root = await tempRoot();
  const definitions = [{ label: "uploads", path: root }];
  const hidden = await analyzeDiskUsagePaths(definitions, { now: fixedNow });
  const shown = await analyzeDiskUsagePaths(definitions, { now: fixedNow, showPaths: true });

  assert.equal(hidden.paths[0].path, undefined);
  assert.equal(shown.paths[0].path, resolve(root));
});

test("disk usage aggregate status chooses the worst path status", async () => {
  const root = await tempRoot();
  const healthy = join(root, "healthy");
  const warning = join(root, "warning");
  const critical = join(root, "critical");
  await Promise.all([mkdir(healthy), mkdir(warning), mkdir(critical)]);
  await writeFile(join(warning, "warning.bin"), Buffer.alloc(10));
  await writeFile(join(critical, "critical.bin"), Buffer.alloc(20));

  const result = await analyzeDiskUsagePaths([
    { label: "healthy", path: healthy },
    { label: "warning", path: warning },
    { label: "critical", path: critical },
  ], {
    now: fixedNow,
    warningBytes: 10,
    criticalBytes: 20,
  });

  assert.equal(result.status, "critical");
  assert.deepEqual(result.paths.map((item) => item.status), ["healthy", "warning", "critical"]);
});

test("disk usage supports per-path threshold overrides", async () => {
  const root = await tempRoot();
  const uploads = join(root, "uploads");
  const logs = join(root, "logs");
  await Promise.all([mkdir(uploads), mkdir(logs)]);
  await writeFile(join(uploads, "upload.bin"), Buffer.alloc(8));
  await writeFile(join(logs, "app.log"), Buffer.alloc(8));

  const result = await analyzeDiskUsagePaths([
    { label: "uploads", path: uploads, warningBytes: 5, criticalBytes: 10 },
    { label: "logs", path: logs, warningBytes: 20, criticalBytes: 30 },
  ], { now: fixedNow });

  assert.deepEqual(result.paths.map((item) => item.status), ["warning", "healthy"]);
  assert.equal(result.status, "warning");
});

test("disk usage does not follow symbolic links", async (context) => {
  const root = await tempRoot();
  const source = join(root, "source.bin");
  const monitored = join(root, "monitored");
  await mkdir(monitored);
  await writeFile(source, Buffer.alloc(50));

  try {
    await symlink(source, join(monitored, "linked.bin"));
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    tempRoots.delete(root);
    context.skip(`Symbolic links are unavailable: ${error.code || error.message}`);
    return;
  }

  assert.equal(await getDirectorySizeBytes(monitored), 0);
});
