import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBackupFreshnessAlert, createLogOnlyBackupAlertPayload } from "../shared/monitoring/backup-alerts.js";

const fixedNow = new Date("2035-01-02T12:00:00.000Z");

function result(overrides = {}) {
  return {
    ok: true,
    status: "fresh",
    checkedAt: fixedNow.toISOString(),
    maxAgeHours: 24,
    message: "Latest backup is fresh.",
    ...overrides,
  };
}

test("backup alert builder does not alert for fresh status by default", () => {
  const alert = buildBackupFreshnessAlert(result(), { now: fixedNow });

  assert.equal(alert.shouldAlert, false);
  assert.equal(alert.alertType, "none");
  assert.equal(alert.severity, "info");
  assert.equal(alert.status, "fresh");
});

test("backup alert builder emits stale backup failure", () => {
  const alert = buildBackupFreshnessAlert(
    result({ ok: false, status: "stale", message: "Latest backup is stale.", latestBackupAgeHours: 30 }),
    { now: fixedNow }
  );

  assert.equal(alert.shouldAlert, true);
  assert.equal(alert.alertType, "backup_failure");
  assert.equal(alert.severity, "warning");
  assert.equal(alert.status, "stale");
  assert.equal(alert.safeDetails.latestBackupAgeHours, 30);
});

test("backup alert builder emits critical missing backup failure", () => {
  const alert = buildBackupFreshnessAlert(result({ ok: false, status: "missing", message: "No backup files found." }), {
    now: fixedNow,
  });

  assert.equal(alert.shouldAlert, true);
  assert.equal(alert.alertType, "backup_failure");
  assert.equal(alert.severity, "critical");
  assert.equal(alert.status, "missing");
});

test("backup alert builder emits critical unreadable backup failure", () => {
  const alert = buildBackupFreshnessAlert(
    result({ ok: false, status: "unreadable", message: "Backup directory cannot be read." }),
    { now: fixedNow }
  );

  assert.equal(alert.shouldAlert, true);
  assert.equal(alert.alertType, "backup_failure");
  assert.equal(alert.severity, "critical");
  assert.equal(alert.status, "unreadable");
});

test("backup alert builder emits monitor failure for configuration error", () => {
  const alert = buildBackupFreshnessAlert(
    result({ ok: false, status: "configuration_error", message: "Invalid monitor configuration." }),
    { now: fixedNow }
  );

  assert.equal(alert.shouldAlert, true);
  assert.equal(alert.alertType, "monitor_failure");
  assert.equal(alert.severity, "critical");
  assert.equal(alert.status, "configuration_error");
});

test("backup alert builder suppresses repeated bad status inside dedupe window", () => {
  const alert = buildBackupFreshnessAlert(result({ ok: false, status: "stale" }), {
    now: fixedNow,
    previousStatus: "stale",
    previousAlertAt: "2035-01-02T11:30:00.000Z",
    dedupeWindowMinutes: 60,
  });

  assert.equal(alert.shouldAlert, false);
  assert.equal(alert.alertType, "none");
  assert.equal(alert.severity, "info");
});

test("backup alert builder re-emits repeated bad status outside dedupe window", () => {
  const alert = buildBackupFreshnessAlert(result({ ok: false, status: "stale" }), {
    now: fixedNow,
    previousStatus: "stale",
    previousAlertAt: "2035-01-02T10:30:00.000Z",
    dedupeWindowMinutes: 60,
  });

  assert.equal(alert.shouldAlert, true);
  assert.equal(alert.alertType, "backup_failure");
  assert.equal(alert.severity, "warning");
});

test("backup alert builder emits recovery when bad status becomes fresh", () => {
  const alert = buildBackupFreshnessAlert(result(), {
    now: fixedNow,
    previousStatus: "stale",
    previousAlertAt: "2035-01-02T11:00:00.000Z",
  });

  assert.equal(alert.shouldAlert, true);
  assert.equal(alert.alertType, "recovery");
  assert.equal(alert.severity, "info");
  assert.equal(alert.status, "fresh");
});

test("backup alert builder hides absolute paths by default", () => {
  const alert = buildBackupFreshnessAlert(
    result({
      latestBackupPath: "C:\\backups\\clinova.sqlite",
      backupDir: "C:\\backups",
      latestBackupAgeHours: 1,
    }),
    { now: fixedNow }
  );

  assert.equal(alert.safeDetails.latestBackupName, "clinova.sqlite");
  assert.equal(alert.safeDetails.latestBackupPath, undefined);
  assert.equal(alert.safeDetails.backupDir, undefined);
});

test("backup alert builder includes paths only when showPaths is true", () => {
  const alert = buildBackupFreshnessAlert(
    result({
      latestBackupPath: "C:\\backups\\clinova.sqlite",
      backupDir: "C:\\backups",
    }),
    { now: fixedNow, showPaths: true }
  );

  assert.equal(alert.safeDetails.latestBackupName, "clinova.sqlite");
  assert.equal(alert.safeDetails.latestBackupPath, "C:\\backups\\clinova.sqlite");
  assert.equal(alert.safeDetails.backupDir, "C:\\backups");
});

test("log-only backup alert payload does not send alerts", () => {
  const alert = buildBackupFreshnessAlert(result({ ok: false, status: "missing" }), { now: fixedNow });
  const payload = createLogOnlyBackupAlertPayload(alert);

  assert.equal(payload.channel, "log_only");
  assert.equal(payload.delivery, "none");
  assert.equal(payload.check, "backup_freshness");
  assert.equal(payload.shouldAlert, true);
  assert.equal(payload.alertType, "backup_failure");
});
