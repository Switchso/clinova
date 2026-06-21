import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const cliPath = join(repoRoot, "server/scripts/check-restore-pending.js");
const tempRoots = new Set();

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "clinova-restore-pending-cli-test-"));
  tempRoots.add(root);
  return root;
}

async function writePendingFiles(backupDir, ageMinutes = 5) {
  await writeFile(join(backupDir, "pending-restore.sqlite"), "sqlite fixture");
  await writeFile(
    join(backupDir, "pending-restore.json"),
    JSON.stringify({
      uploadedName: "restore.sqlite",
      source: join(backupDir, "restore-uploads", "restore.sqlite"),
      requestedBy: 1,
      safetyBackup: join(backupDir, "safety.sqlite"),
      createdAt: new Date(Date.now() - ageMinutes * 60 * 1000).toISOString(),
    })
  );
}

function runCli(env = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [cliPath], {
      cwd: repoRoot,
      env: {
        ...process.env,
        BACKUP_DIR: "",
        RESTORE_PENDING_STALE_AFTER_MINUTES: "",
        RESTORE_PENDING_SHOW_PATHS: "",
        RESTORE_PENDING_ALERT_MODE: "",
        RESTORE_PENDING_PREVIOUS_STATUS: "",
        RESTORE_PENDING_PREVIOUS_ALERT_AT: "",
        RESTORE_PENDING_DEDUPE_WINDOW_MINUTES: "",
        ...env,
      },
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      const trimmed = stdout.trim();
      resolveRun({
        code,
        stdout,
        stderr,
        json: trimmed ? JSON.parse(trimmed) : null,
      });
    });
  });
}

afterEach(async () => {
  await Promise.all([...tempRoots].map((root) => rm(root, { recursive: true, force: true })));
  tempRoots.clear();
});

test("restore pending CLI exits 0 when no marker files exist", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);

  const result = await runCli({ BACKUP_DIR: backupDir });

  assert.equal(result.code, 0);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.status, "none");
  assert.equal(result.json.staleAfterMinutes, 30);
  assert.equal(result.json.pendingAgeMinutes, null);
  assert.equal(result.json.hasPendingSqlite, false);
  assert.equal(result.json.hasPendingJson, false);
  assert.equal(result.json.restore, undefined);
  assert.equal(result.json.alert, undefined);
  assert.equal(result.stderr, "");
});

test("restore pending CLI exits 1 for fresh pending markers", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writePendingFiles(backupDir);

  const result = await runCli({ BACKUP_DIR: backupDir });

  assert.equal(result.code, 1);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.status, "pending");
  assert.equal(result.json.hasPendingSqlite, true);
  assert.equal(result.json.hasPendingJson, true);
  assert.equal(result.json.metadata.source, "restore.sqlite");
  assert.equal(result.json.metadata.safetyBackup, "safety.sqlite");
});

test("restore pending CLI exits 1 for stale pending markers", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writePendingFiles(backupDir, 45);

  const result = await runCli({
    BACKUP_DIR: backupDir,
    RESTORE_PENDING_STALE_AFTER_MINUTES: "30",
  });

  assert.equal(result.code, 1);
  assert.equal(result.json.status, "stale");
  assert.ok(result.json.pendingAgeMinutes >= 44);
});

test("restore pending CLI exits 1 for a partial marker", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writeFile(join(backupDir, "pending-restore.sqlite"), "sqlite fixture");

  const result = await runCli({ BACKUP_DIR: backupDir });

  assert.equal(result.code, 1);
  assert.equal(result.json.status, "partial");
  assert.equal(result.json.hasPendingSqlite, true);
  assert.equal(result.json.hasPendingJson, false);
});

test("restore pending CLI exits 1 for invalid metadata JSON", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writeFile(join(backupDir, "pending-restore.sqlite"), "sqlite fixture");
  await writeFile(join(backupDir, "pending-restore.json"), "{not json");

  const result = await runCli({ BACKUP_DIR: backupDir });

  assert.equal(result.code, 1);
  assert.equal(result.json.status, "invalid");
});

test("restore pending CLI exits 1 for a missing backup directory", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "missing");

  const result = await runCli({ BACKUP_DIR: backupDir });

  assert.equal(result.code, 1);
  assert.equal(result.json.status, "unreadable");
});

test("restore pending CLI exits 2 for invalid stale threshold", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);

  const result = await runCli({
    BACKUP_DIR: backupDir,
    RESTORE_PENDING_STALE_AFTER_MINUTES: "not-a-number",
  });

  assert.equal(result.code, 2);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.status, "configuration_error");
  assert.match(result.json.message, /RESTORE_PENDING_STALE_AFTER_MINUTES/);
});

test("restore pending CLI hides absolute paths by default", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writePendingFiles(backupDir);

  const result = await runCli({ BACKUP_DIR: backupDir });

  assert.equal(result.code, 1);
  assert.equal(result.json.backupDir, undefined);
  assert.equal(result.json.paths, undefined);
  assert.equal(result.json.metadata.source, "restore.sqlite");
  assert.equal(result.json.metadata.safetyBackup, "safety.sqlite");
});

test("restore pending CLI shows paths only when explicitly enabled", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writePendingFiles(backupDir);

  const result = await runCli({
    BACKUP_DIR: backupDir,
    RESTORE_PENDING_SHOW_PATHS: "true",
  });

  assert.equal(result.code, 1);
  assert.equal(result.json.backupDir, resolve(backupDir));
  assert.equal(result.json.paths.pendingSqlitePath, resolve(backupDir, "pending-restore.sqlite"));
  assert.equal(result.json.paths.pendingJsonPath, resolve(backupDir, "pending-restore.json"));
  assert.equal(result.json.metadata.source, resolve(backupDir, "restore-uploads", "restore.sqlite"));
  assert.equal(result.json.metadata.safetyBackup, resolve(backupDir, "safety.sqlite"));
});

test("restore pending CLI alert mode wraps none status with no-alert payload", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);

  const result = await runCli({
    BACKUP_DIR: backupDir,
    RESTORE_PENDING_ALERT_MODE: "log",
  });

  assert.equal(result.code, 0);
  assert.equal(result.json.restore.status, "none");
  assert.equal(result.json.alert.channel, "log_only");
  assert.equal(result.json.alert.delivery, "none");
  assert.equal(result.json.alert.alertType, "none");
  assert.equal(result.json.alert.shouldAlert, false);
});

test("restore pending CLI alert mode reports pending warning", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writePendingFiles(backupDir);

  const result = await runCli({
    BACKUP_DIR: backupDir,
    RESTORE_PENDING_ALERT_MODE: "log",
  });

  assert.equal(result.code, 1);
  assert.equal(result.json.restore.status, "pending");
  assert.equal(result.json.alert.alertType, "restore_pending");
  assert.equal(result.json.alert.severity, "warning");
  assert.equal(result.json.alert.shouldAlert, true);
});

test("restore pending CLI alert mode reports stale critical alert", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writePendingFiles(backupDir, 45);

  const result = await runCli({
    BACKUP_DIR: backupDir,
    RESTORE_PENDING_ALERT_MODE: "log",
    RESTORE_PENDING_STALE_AFTER_MINUTES: "30",
  });

  assert.equal(result.code, 1);
  assert.equal(result.json.restore.status, "stale");
  assert.equal(result.json.alert.alertType, "restore_stale");
  assert.equal(result.json.alert.severity, "critical");
});

for (const markerState of ["partial", "invalid"]) {
  test(`restore pending CLI alert mode reports ${markerState} as critical invalid alert`, async () => {
    const root = await tempRoot();
    const backupDir = join(root, "backups");
    await mkdir(backupDir);
    await writeFile(join(backupDir, "pending-restore.sqlite"), "sqlite fixture");
    if (markerState === "invalid") {
      await writeFile(join(backupDir, "pending-restore.json"), "{not json");
    }

    const result = await runCli({
      BACKUP_DIR: backupDir,
      RESTORE_PENDING_ALERT_MODE: "log",
    });

    assert.equal(result.code, 1);
    assert.equal(result.json.restore.status, markerState);
    assert.equal(result.json.alert.alertType, "restore_invalid");
    assert.equal(result.json.alert.severity, "critical");
  });
}

test("restore pending CLI alert mode suppresses repeated pending inside dedupe window without changing exit code", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writePendingFiles(backupDir);

  const result = await runCli({
    BACKUP_DIR: backupDir,
    RESTORE_PENDING_ALERT_MODE: "log",
    RESTORE_PENDING_PREVIOUS_STATUS: "pending",
    RESTORE_PENDING_PREVIOUS_ALERT_AT: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    RESTORE_PENDING_DEDUPE_WINDOW_MINUTES: "60",
  });

  assert.equal(result.code, 1);
  assert.equal(result.json.restore.status, "pending");
  assert.equal(result.json.alert.alertType, "none");
  assert.equal(result.json.alert.shouldAlert, false);
});

test("restore pending CLI alert mode emits recovery from pending to none", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);

  const result = await runCli({
    BACKUP_DIR: backupDir,
    RESTORE_PENDING_ALERT_MODE: "log",
    RESTORE_PENDING_PREVIOUS_STATUS: "pending",
  });

  assert.equal(result.code, 0);
  assert.equal(result.json.restore.status, "none");
  assert.equal(result.json.alert.alertType, "restore_recovery");
  assert.equal(result.json.alert.severity, "info");
  assert.equal(result.json.alert.shouldAlert, true);
});

test("restore pending CLI invalid alert mode exits 2 with JSON error", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);

  const result = await runCli({
    BACKUP_DIR: backupDir,
    RESTORE_PENDING_ALERT_MODE: "email",
  });

  assert.equal(result.code, 2);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.status, "configuration_error");
  assert.match(result.json.message, /RESTORE_PENDING_ALERT_MODE/);
});

test("restore pending CLI alert mode hides paths in restore and alert payloads by default", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writePendingFiles(backupDir);

  const result = await runCli({
    BACKUP_DIR: backupDir,
    RESTORE_PENDING_ALERT_MODE: "log",
  });

  assert.equal(result.code, 1);
  assert.equal(result.json.restore.backupDir, undefined);
  assert.equal(result.json.restore.paths, undefined);
  assert.equal(result.json.alert.safeDetails.backupDir, undefined);
  assert.equal(result.json.alert.safeDetails.paths, undefined);
  assert.equal(result.json.alert.safeDetails.metadata.source, "restore.sqlite");
  assert.equal(result.json.alert.safeDetails.metadata.safetyBackup, "safety.sqlite");
});

test("restore pending CLI alert mode includes paths only when explicitly enabled", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writePendingFiles(backupDir);

  const result = await runCli({
    BACKUP_DIR: backupDir,
    RESTORE_PENDING_ALERT_MODE: "log",
    RESTORE_PENDING_SHOW_PATHS: "true",
  });

  assert.equal(result.code, 1);
  assert.equal(result.json.restore.backupDir, resolve(backupDir));
  assert.equal(result.json.alert.safeDetails.backupDir, resolve(backupDir));
  assert.equal(
    result.json.alert.safeDetails.paths.pendingSqlitePath,
    resolve(backupDir, "pending-restore.sqlite")
  );
  assert.equal(result.json.alert.safeDetails.metadata.source, resolve(backupDir, "restore-uploads", "restore.sqlite"));
});
