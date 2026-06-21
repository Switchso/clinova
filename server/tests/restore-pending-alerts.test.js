import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRestorePendingAlert,
  createLogOnlyRestorePendingAlertPayload,
} from "../shared/monitoring/restore-pending-alerts.js";

const fixedNow = new Date("2035-01-02T12:00:00.000Z");

function result(overrides = {}) {
  return {
    ok: true,
    status: "none",
    checkedAt: fixedNow.toISOString(),
    staleAfterMinutes: 30,
    pendingAgeMinutes: null,
    hasPendingSqlite: false,
    hasPendingJson: false,
    message: "No pending restore marker found.",
    ...overrides,
  };
}

test("restore pending alert builder does not alert for none status", () => {
  const alert = buildRestorePendingAlert(result(), { now: fixedNow });

  assert.equal(alert.shouldAlert, false);
  assert.equal(alert.alertType, "none");
  assert.equal(alert.severity, "info");
  assert.equal(alert.status, "none");
});

test("restore pending alert builder emits warning for pending status", () => {
  const alert = buildRestorePendingAlert(
    result({
      ok: false,
      status: "pending",
      pendingAgeMinutes: 5,
      hasPendingSqlite: true,
      hasPendingJson: true,
      message: "Pending restore marker found.",
    }),
    { now: fixedNow }
  );

  assert.equal(alert.shouldAlert, true);
  assert.equal(alert.alertType, "restore_pending");
  assert.equal(alert.severity, "warning");
  assert.equal(alert.safeDetails.pendingAgeMinutes, 5);
});

test("restore pending alert builder emits critical alert for stale status", () => {
  const alert = buildRestorePendingAlert(result({ ok: false, status: "stale" }), { now: fixedNow });

  assert.equal(alert.shouldAlert, true);
  assert.equal(alert.alertType, "restore_stale");
  assert.equal(alert.severity, "critical");
});

for (const status of ["partial", "invalid", "unreadable"]) {
  test(`restore pending alert builder emits critical invalid alert for ${status} status`, () => {
    const alert = buildRestorePendingAlert(result({ ok: false, status }), { now: fixedNow });

    assert.equal(alert.shouldAlert, true);
    assert.equal(alert.alertType, "restore_invalid");
    assert.equal(alert.severity, "critical");
  });
}

test("restore pending alert builder suppresses repeated pending inside dedupe window", () => {
  const alert = buildRestorePendingAlert(result({ ok: false, status: "pending" }), {
    now: fixedNow,
    previousStatus: "pending",
    previousAlertAt: "2035-01-02T11:30:00.000Z",
    dedupeWindowMinutes: 60,
  });

  assert.equal(alert.shouldAlert, false);
  assert.equal(alert.alertType, "none");
  assert.equal(alert.severity, "info");
});

test("restore pending alert builder repeats pending outside dedupe window", () => {
  const alert = buildRestorePendingAlert(result({ ok: false, status: "pending" }), {
    now: fixedNow,
    previousStatus: "pending",
    previousAlertAt: "2035-01-02T10:30:00.000Z",
    dedupeWindowMinutes: 60,
  });

  assert.equal(alert.shouldAlert, true);
  assert.equal(alert.alertType, "restore_pending");
  assert.equal(alert.severity, "warning");
});

test("restore pending alert builder alerts when pending changes to stale inside dedupe window", () => {
  const alert = buildRestorePendingAlert(result({ ok: false, status: "stale" }), {
    now: fixedNow,
    previousStatus: "pending",
    previousAlertAt: "2035-01-02T11:55:00.000Z",
    dedupeWindowMinutes: 60,
  });

  assert.equal(alert.shouldAlert, true);
  assert.equal(alert.alertType, "restore_stale");
  assert.equal(alert.severity, "critical");
});

test("restore pending alert builder emits recovery when pending changes to none", () => {
  const alert = buildRestorePendingAlert(result(), {
    now: fixedNow,
    previousStatus: "pending",
    previousAlertAt: "2035-01-02T11:30:00.000Z",
  });

  assert.equal(alert.shouldAlert, true);
  assert.equal(alert.alertType, "restore_recovery");
  assert.equal(alert.severity, "info");
});

test("restore pending alert builder hides absolute paths by default", () => {
  const alert = buildRestorePendingAlert(
    result({
      ok: false,
      status: "pending",
      backupDir: "C:\\backups",
      paths: {
        pendingSqlitePath: "C:\\backups\\pending-restore.sqlite",
        pendingJsonPath: "C:\\backups\\pending-restore.json",
      },
      metadata: {
        uploadedName: "restore.sqlite",
        requestedBy: 1,
        createdAt: fixedNow.toISOString(),
        source: "C:\\backups\\restore-uploads\\restore.sqlite",
        safetyBackup: "C:\\backups\\safety.sqlite",
        secret: "must-not-be-included",
      },
    }),
    { now: fixedNow }
  );

  assert.equal(alert.safeDetails.backupDir, undefined);
  assert.equal(alert.safeDetails.paths, undefined);
  assert.equal(alert.safeDetails.metadata.source, "restore.sqlite");
  assert.equal(alert.safeDetails.metadata.safetyBackup, "safety.sqlite");
  assert.equal(alert.safeDetails.metadata.secret, undefined);
});

test("restore pending alert builder includes paths only when showPaths is true", () => {
  const current = result({
    ok: false,
    status: "pending",
    backupDir: "C:\\backups",
    paths: {
      pendingSqlitePath: "C:\\backups\\pending-restore.sqlite",
      pendingJsonPath: "C:\\backups\\pending-restore.json",
    },
    metadata: {
      source: "C:\\backups\\restore-uploads\\restore.sqlite",
      safetyBackup: "C:\\backups\\safety.sqlite",
    },
  });
  const alert = buildRestorePendingAlert(current, { now: fixedNow, showPaths: true });

  assert.equal(alert.safeDetails.backupDir, current.backupDir);
  assert.deepEqual(alert.safeDetails.paths, current.paths);
  assert.equal(alert.safeDetails.metadata.source, current.metadata.source);
  assert.equal(alert.safeDetails.metadata.safetyBackup, current.metadata.safetyBackup);
});

test("log-only restore pending payload has no delivery side effects", () => {
  const alert = buildRestorePendingAlert(result({ ok: false, status: "stale" }), { now: fixedNow });
  const payload = createLogOnlyRestorePendingAlertPayload(alert);

  assert.equal(payload.channel, "log_only");
  assert.equal(payload.delivery, "none");
  assert.equal(payload.check, "restore_pending");
  assert.equal(payload.shouldAlert, true);
  assert.equal(payload.alertType, "restore_stale");
  assert.deepEqual(payload.safeDetails, alert.safeDetails);
});
