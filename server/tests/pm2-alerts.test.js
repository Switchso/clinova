import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPm2StatusAlert,
  createLogOnlyPm2StatusAlertPayload,
} from "../shared/monitoring/pm2-alerts.js";

const fixedNow = new Date("2035-01-02T12:00:00.000Z");

function result(overrides = {}) {
  return {
    ok: true,
    status: "healthy",
    checkedAt: fixedNow.toISOString(),
    processes: [
      {
        name: "clinova",
        status: "healthy",
        ok: true,
        restartCount: 0,
        uptimeMinutes: 120,
        memoryMb: 128,
        cpuPercent: 2,
        issues: [],
      },
    ],
    missingProcesses: [],
    message: "All expected PM2 processes are healthy.",
    ...overrides,
  };
}

test("PM2 alert builder does not alert for healthy status", () => {
  const alert = buildPm2StatusAlert(result(), { now: fixedNow });

  assert.equal(alert.shouldAlert, false);
  assert.equal(alert.alertType, "none");
  assert.equal(alert.severity, "info");
  assert.equal(alert.status, "healthy");
});

for (const status of ["degraded", "restarting"]) {
  test(`PM2 alert builder emits warning for ${status} status`, () => {
    const alert = buildPm2StatusAlert(result({ ok: false, status }), { now: fixedNow });

    assert.equal(alert.shouldAlert, true);
    assert.equal(alert.alertType, "pm2_degraded");
    assert.equal(alert.severity, "warning");
  });
}

for (const status of ["missing", "offline", "unhealthy"]) {
  test(`PM2 alert builder emits critical down alert for ${status} status`, () => {
    const alert = buildPm2StatusAlert(result({ ok: false, status }), { now: fixedNow });

    assert.equal(alert.shouldAlert, true);
    assert.equal(alert.alertType, "pm2_down");
    assert.equal(alert.severity, "critical");
  });
}

test("PM2 alert builder emits critical monitor failure for synthetic monitor error", () => {
  const alert = buildPm2StatusAlert(
    result({
      ok: false,
      status: "monitor_error",
      processes: [],
      message: "PM2 command is unavailable.",
    }),
    { now: fixedNow }
  );

  assert.equal(alert.shouldAlert, true);
  assert.equal(alert.alertType, "pm2_monitor_failure");
  assert.equal(alert.severity, "critical");
});

test("PM2 alert builder suppresses repeated degraded status inside dedupe window", () => {
  const alert = buildPm2StatusAlert(result({ ok: false, status: "degraded" }), {
    now: fixedNow,
    previousStatus: "degraded",
    previousAlertAt: "2035-01-02T11:30:00.000Z",
    dedupeWindowMinutes: 60,
  });

  assert.equal(alert.shouldAlert, false);
  assert.equal(alert.alertType, "none");
  assert.equal(alert.severity, "info");
});

test("PM2 alert builder repeats degraded status outside dedupe window", () => {
  const alert = buildPm2StatusAlert(result({ ok: false, status: "degraded" }), {
    now: fixedNow,
    previousStatus: "degraded",
    previousAlertAt: "2035-01-02T10:30:00.000Z",
    dedupeWindowMinutes: 60,
  });

  assert.equal(alert.shouldAlert, true);
  assert.equal(alert.alertType, "pm2_degraded");
  assert.equal(alert.severity, "warning");
});

test("PM2 alert builder alerts when degraded changes to offline inside dedupe window", () => {
  const alert = buildPm2StatusAlert(result({ ok: false, status: "offline" }), {
    now: fixedNow,
    previousStatus: "degraded",
    previousAlertAt: "2035-01-02T11:55:00.000Z",
    dedupeWindowMinutes: 60,
  });

  assert.equal(alert.shouldAlert, true);
  assert.equal(alert.alertType, "pm2_down");
  assert.equal(alert.severity, "critical");
});

test("PM2 alert builder emits recovery when offline changes to healthy", () => {
  const alert = buildPm2StatusAlert(result(), {
    now: fixedNow,
    previousStatus: "offline",
    previousAlertAt: "2035-01-02T11:30:00.000Z",
  });

  assert.equal(alert.shouldAlert, true);
  assert.equal(alert.alertType, "pm2_recovery");
  assert.equal(alert.severity, "info");
});

test("PM2 alert builder includes only safe process summaries", () => {
  const alert = buildPm2StatusAlert(
    result({
      ok: false,
      status: "offline",
      missingProcesses: ["clinova-backup", 123],
      secret: "must-not-be-included",
      rawOutput: "must-not-be-included",
      processes: [
        {
          name: "clinova",
          status: "offline",
          restartCount: 4,
          uptimeMinutes: 0,
          memoryMb: 0,
          cpuPercent: 0,
          issues: ["Process status is stopped.", { secret: true }],
          ok: false,
          pm2_env: { DATABASE_URL: "secret", pm_exec_path: "C:\\app\\server\\app.js" },
          logs: "sensitive logs",
          path: "C:\\app\\server\\app.js",
          token: "secret",
        },
      ],
    }),
    { now: fixedNow }
  );

  assert.deepEqual(alert.safeDetails, {
    checkedAt: fixedNow.toISOString(),
    missingProcesses: ["clinova-backup"],
    processes: [
      {
        name: "clinova",
        status: "offline",
        restartCount: 4,
        uptimeMinutes: 0,
        memoryMb: 0,
        cpuPercent: 0,
        issues: ["Process status is stopped."],
      },
    ],
  });
  assert.equal(JSON.stringify(alert.safeDetails).includes("secret"), false);
  assert.equal(JSON.stringify(alert.safeDetails).includes("C:\\app"), false);
});

test("log-only PM2 alert payload has no delivery side effects", () => {
  const alert = buildPm2StatusAlert(result({ ok: false, status: "offline" }), { now: fixedNow });
  const payload = createLogOnlyPm2StatusAlertPayload(alert);

  assert.deepEqual(payload, {
    channel: "log_only",
    delivery: "none",
    check: "pm2_status",
    shouldAlert: true,
    alertType: "pm2_down",
    severity: "critical",
    status: "offline",
    message: alert.message,
    safeDetails: alert.safeDetails,
    createdAt: fixedNow.toISOString(),
  });
});
