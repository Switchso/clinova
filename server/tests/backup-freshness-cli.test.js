import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const cliPath = join(repoRoot, "server/scripts/check-backup-freshness.js");
const tempRoots = new Set();

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "clinova-backup-freshness-cli-test-"));
  tempRoots.add(root);
  return root;
}

async function writeBackup(dir, name, ageHours) {
  const path = join(dir, name);
  await writeFile(path, `backup ${name}`);
  const mtime = new Date(Date.now() - ageHours * 60 * 60 * 1000);
  await import("node:fs/promises").then(({ utimes }) => utimes(path, mtime, mtime));
  return path;
}

function runCli(env = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [cliPath], {
      cwd: repoRoot,
      env: {
        ...process.env,
        BACKUP_DIR: "",
        BACKUP_FRESHNESS_MAX_AGE_HOURS: "",
        BACKUP_FRESHNESS_EXTENSIONS: "",
        BACKUP_FRESHNESS_SHOW_PATHS: "",
        BACKUP_MONITOR_ALERT_MODE: "",
        BACKUP_MONITOR_PREVIOUS_STATUS: "",
        BACKUP_MONITOR_PREVIOUS_ALERT_AT: "",
        BACKUP_MONITOR_DEDUPE_WINDOW_MINUTES: "",
        BACKUP_MONITOR_SHOW_PATHS: "",
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

test("backup freshness CLI exits 0 and returns JSON for fresh backup", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writeBackup(backupDir, "fresh.sqlite", 1);

  const result = await runCli({ BACKUP_DIR: backupDir, BACKUP_FRESHNESS_MAX_AGE_HOURS: "24" });

  assert.equal(result.code, 0);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.status, "fresh");
  assert.equal(result.json.latestBackupName, "fresh.sqlite");
  assert.equal(result.json.latestBackupPath, undefined);
  assert.equal(result.json.backup, undefined);
  assert.equal(result.json.alert, undefined);
  assert.equal(result.stderr, "");
});

test("backup freshness CLI exits 1 for stale backup", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writeBackup(backupDir, "stale.sqlite", 30);

  const result = await runCli({ BACKUP_DIR: backupDir, BACKUP_FRESHNESS_MAX_AGE_HOURS: "24" });

  assert.equal(result.code, 1);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.status, "stale");
  assert.equal(result.json.latestBackupName, "stale.sqlite");
});

test("backup freshness CLI exits 1 for missing backup directory", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "missing");

  const result = await runCli({ BACKUP_DIR: backupDir });

  assert.equal(result.code, 1);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.status, "missing");
  assert.equal(result.json.latestBackupPath, undefined);
});

test("backup freshness CLI exits 2 for invalid max age", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);

  const result = await runCli({ BACKUP_DIR: backupDir, BACKUP_FRESHNESS_MAX_AGE_HOURS: "not-a-number" });

  assert.equal(result.code, 2);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.status, "configuration_error");
});

test("backup freshness CLI hides absolute paths by default", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writeBackup(backupDir, "hidden-path.sqlite", 1);

  const result = await runCli({ BACKUP_DIR: backupDir });

  assert.equal(result.code, 0);
  assert.equal(result.json.latestBackupName, "hidden-path.sqlite");
  assert.equal(result.json.latestBackupPath, undefined);
  assert.equal(result.json.backupDir, undefined);
});

test("backup freshness CLI can show absolute paths when explicitly enabled", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  const backupPath = await writeBackup(backupDir, "visible-path.sqlite", 1);

  const result = await runCli({
    BACKUP_DIR: backupDir,
    BACKUP_FRESHNESS_SHOW_PATHS: "true",
  });

  assert.equal(result.code, 0);
  assert.equal(result.json.latestBackupName, "visible-path.sqlite");
  assert.equal(result.json.backupDir, resolve(backupDir));
  assert.equal(result.json.latestBackupPath, resolve(backupPath));
});

test("backup freshness CLI alert log mode wraps fresh backup with no-alert payload", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writeBackup(backupDir, "fresh-alert.sqlite", 1);

  const result = await runCli({
    BACKUP_DIR: backupDir,
    BACKUP_MONITOR_ALERT_MODE: "log",
  });

  assert.equal(result.code, 0);
  assert.equal(result.json.backup.ok, true);
  assert.equal(result.json.backup.status, "fresh");
  assert.equal(result.json.backup.latestBackupName, "fresh-alert.sqlite");
  assert.equal(result.json.backup.latestBackupPath, undefined);
  assert.equal(result.json.alert.channel, "log_only");
  assert.equal(result.json.alert.delivery, "none");
  assert.equal(result.json.alert.alertType, "none");
  assert.equal(result.json.alert.shouldAlert, false);
  assert.equal(result.json.alert.safeDetails.latestBackupPath, undefined);
});

test("backup freshness CLI alert log mode reports stale backup failure", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writeBackup(backupDir, "stale-alert.sqlite", 30);

  const result = await runCli({
    BACKUP_DIR: backupDir,
    BACKUP_FRESHNESS_MAX_AGE_HOURS: "24",
    BACKUP_MONITOR_ALERT_MODE: "log",
  });

  assert.equal(result.code, 1);
  assert.equal(result.json.backup.ok, false);
  assert.equal(result.json.backup.status, "stale");
  assert.equal(result.json.alert.alertType, "backup_failure");
  assert.equal(result.json.alert.severity, "warning");
  assert.equal(result.json.alert.shouldAlert, true);
});

test("backup freshness CLI alert log mode suppresses repeated stale inside dedupe window", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writeBackup(backupDir, "stale-dedupe.sqlite", 30);
  const previousAlertAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const result = await runCli({
    BACKUP_DIR: backupDir,
    BACKUP_FRESHNESS_MAX_AGE_HOURS: "24",
    BACKUP_MONITOR_ALERT_MODE: "log",
    BACKUP_MONITOR_PREVIOUS_STATUS: "stale",
    BACKUP_MONITOR_PREVIOUS_ALERT_AT: previousAlertAt,
    BACKUP_MONITOR_DEDUPE_WINDOW_MINUTES: "60",
  });

  assert.equal(result.code, 1);
  assert.equal(result.json.backup.status, "stale");
  assert.equal(result.json.alert.alertType, "none");
  assert.equal(result.json.alert.shouldAlert, false);
});

test("backup freshness CLI alert log mode emits recovery when stale becomes fresh", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writeBackup(backupDir, "recovered.sqlite", 1);

  const result = await runCli({
    BACKUP_DIR: backupDir,
    BACKUP_MONITOR_ALERT_MODE: "log",
    BACKUP_MONITOR_PREVIOUS_STATUS: "stale",
  });

  assert.equal(result.code, 0);
  assert.equal(result.json.backup.status, "fresh");
  assert.equal(result.json.alert.alertType, "recovery");
  assert.equal(result.json.alert.shouldAlert, true);
  assert.equal(result.json.alert.severity, "info");
});

test("backup freshness CLI invalid alert mode exits 2 with JSON error", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);

  const result = await runCli({
    BACKUP_DIR: backupDir,
    BACKUP_MONITOR_ALERT_MODE: "email",
  });

  assert.equal(result.code, 2);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.status, "configuration_error");
  assert.match(result.json.message, /BACKUP_MONITOR_ALERT_MODE/);
});

test("backup freshness CLI alert log mode hides paths by default in backup and alert payloads", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  await writeBackup(backupDir, "hidden-alert-path.sqlite", 1);

  const result = await runCli({
    BACKUP_DIR: backupDir,
    BACKUP_MONITOR_ALERT_MODE: "log",
  });

  assert.equal(result.code, 0);
  assert.equal(result.json.backup.latestBackupName, "hidden-alert-path.sqlite");
  assert.equal(result.json.backup.latestBackupPath, undefined);
  assert.equal(result.json.backup.backupDir, undefined);
  assert.equal(result.json.alert.safeDetails.latestBackupName, "hidden-alert-path.sqlite");
  assert.equal(result.json.alert.safeDetails.latestBackupPath, undefined);
  assert.equal(result.json.alert.safeDetails.backupDir, undefined);
});

test("backup freshness CLI alert log mode includes paths only when explicitly enabled", async () => {
  const root = await tempRoot();
  const backupDir = join(root, "backups");
  await mkdir(backupDir);
  const backupPath = await writeBackup(backupDir, "visible-alert-path.sqlite", 1);

  const result = await runCli({
    BACKUP_DIR: backupDir,
    BACKUP_MONITOR_ALERT_MODE: "log",
    BACKUP_FRESHNESS_SHOW_PATHS: "true",
    BACKUP_MONITOR_SHOW_PATHS: "true",
  });

  assert.equal(result.code, 0);
  assert.equal(result.json.backup.backupDir, resolve(backupDir));
  assert.equal(result.json.backup.latestBackupPath, resolve(backupPath));
  assert.equal(result.json.alert.safeDetails.backupDir, resolve(backupDir));
  assert.equal(result.json.alert.safeDetails.latestBackupPath, resolve(backupPath));
});
