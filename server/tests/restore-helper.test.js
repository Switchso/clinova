import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import {
  assertSafeRestoreEnvironment,
  cleanupRestoreEnvironment,
  startInitializedRestoreServer,
  stopRestoreServer,
} from "./helpers/restore-test-server.js";

test("restore helper starts and stops an isolated server without restore", async () => {
  const server = await startInitializedRestoreServer();
  assert.equal(assertSafeRestoreEnvironment(server), true);

  try {
    const health = await fetch(`${server.baseUrl}/api/health`);
    assert.equal(health.status, 200);

    await assert.rejects(access(join(server.backupsDir, "pending-restore.sqlite")));
    await assert.rejects(access(join(server.backupsDir, "pending-restore.json")));

    await stopRestoreServer(server);
    assert.ok(server.child.exitCode !== null || server.child.signalCode !== null);
  } finally {
    await stopRestoreServer(server);
    await cleanupRestoreEnvironment(server);
  }

  await assert.rejects(access(server.root));
});

test("restore helper cleanup guard refuses unsafe paths", async () => {
  const unsafeEnvironment = {
    root: process.cwd(),
    env: {
      DATABASE_URL: "",
      DATABASE_PATH: join(process.cwd(), "data", "clinic.sqlite"),
      UPLOAD_DIR: join(process.cwd(), "uploads"),
      BACKUP_DIR: join(process.cwd(), "backups"),
    },
  };

  assert.throws(
    () => assertSafeRestoreEnvironment(unsafeEnvironment),
    /Unsafe restore test temp root/,
  );
  await assert.rejects(
    () => cleanupRestoreEnvironment(unsafeEnvironment),
    /Unsafe restore test temp root/,
  );
});
