import assert from "node:assert/strict";
import { test } from "node:test";
import { runPm2StatusCli } from "../scripts/check-pm2-status.js";

const fixedNow = new Date("2035-01-02T12:00:00.000Z");

function fixture(name, overrides = {}) {
  return {
    name,
    pm2_env: {
      status: "online",
      restart_time: 0,
      pm_uptime: fixedNow.getTime() - 60 * 60 * 1000,
      ...overrides.pm2_env,
    },
    monit: {
      memory: 100 * 1024 * 1024,
      cpu: 2,
      ...overrides.monit,
    },
  };
}

function runner(processes) {
  return async () => JSON.stringify(processes);
}

test("PM2 status CLI returns exit 0 for healthy fixture output", async () => {
  const result = await runPm2StatusCli({
    env: {},
    runCommand: runner([fixture("clinova"), fixture("clinova-backup")]),
    now: fixedNow,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.payload.status, "healthy");
  assert.equal(result.payload.ok, true);
});

test("PM2 status CLI default output remains unchanged without alert wrapper", async () => {
  const result = await runPm2StatusCli({
    env: {},
    runCommand: runner([fixture("clinova"), fixture("clinova-backup")]),
    now: fixedNow,
  });

  assert.deepEqual(Object.keys(result.payload), [
    "ok",
    "status",
    "checkedAt",
    "processes",
    "missingProcesses",
    "message",
  ]);
  assert.equal(result.payload.pm2, undefined);
  assert.equal(result.payload.alert, undefined);
});

test("PM2 status CLI returns exit 1 for missing expected process", async () => {
  const result = await runPm2StatusCli({
    env: {},
    runCommand: runner([fixture("clinova")]),
    now: fixedNow,
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.payload.status, "missing");
  assert.deepEqual(result.payload.missingProcesses, ["clinova-backup"]);
});

test("PM2 status CLI returns exit 1 for offline process", async () => {
  const result = await runPm2StatusCli({
    env: { PM2_MONITOR_EXPECTED_PROCESSES: "clinova" },
    runCommand: runner([fixture("clinova", { pm2_env: { status: "stopped" } })]),
    now: fixedNow,
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.payload.status, "offline");
});

test("PM2 status CLI returns exit 1 when restart threshold is exceeded", async () => {
  const result = await runPm2StatusCli({
    env: {
      PM2_MONITOR_EXPECTED_PROCESSES: "clinova",
      PM2_MONITOR_MAX_RESTART_COUNT: "3",
    },
    runCommand: runner([fixture("clinova", { pm2_env: { restart_time: 4 } })]),
    now: fixedNow,
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.payload.status, "degraded");
});

test("PM2 status CLI returns exit 1 for high memory", async () => {
  const result = await runPm2StatusCli({
    env: {
      PM2_MONITOR_EXPECTED_PROCESSES: "clinova",
      PM2_MONITOR_MAX_MEMORY_MB: "300",
    },
    runCommand: runner([fixture("clinova", { monit: { memory: 350 * 1024 * 1024 } })]),
    now: fixedNow,
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.payload.status, "degraded");
});

test("PM2 status CLI returns exit 2 when PM2 command is unavailable", async () => {
  const error = new Error("PM2 status command is unavailable.");
  error.code = "PM2_UNAVAILABLE";
  const result = await runPm2StatusCli({
    env: {},
    runCommand: async () => {
      throw error;
    },
    now: fixedNow,
  });

  assert.equal(result.exitCode, 2);
  assert.equal(result.payload.status, "monitor_error");
  assert.match(result.payload.message, /unavailable/);
});

test("PM2 status CLI returns exit 2 on timeout", async () => {
  const error = new Error("PM2 status command timed out.");
  error.code = "PM2_TIMEOUT";
  const result = await runPm2StatusCli({
    env: { PM2_MONITOR_TIMEOUT_MS: "250" },
    runCommand: async ({ timeoutMs }) => {
      assert.equal(timeoutMs, 250);
      throw error;
    },
    now: fixedNow,
  });

  assert.equal(result.exitCode, 2);
  assert.equal(result.payload.status, "monitor_error");
  assert.match(result.payload.message, /timed out/);
});

test("PM2 status CLI returns exit 2 for invalid JSON", async () => {
  const result = await runPm2StatusCli({
    env: {},
    runCommand: async () => "not-json",
    now: fixedNow,
  });

  assert.equal(result.exitCode, 2);
  assert.equal(result.payload.status, "monitor_error");
  assert.match(result.payload.message, /invalid JSON/);
});

test("PM2 status CLI returns exit 2 for invalid environment values", async () => {
  const invalidExpected = await runPm2StatusCli({
    env: { PM2_MONITOR_EXPECTED_PROCESSES: ", ," },
    runCommand: runner([]),
    now: fixedNow,
  });
  const invalidNumber = await runPm2StatusCli({
    env: { PM2_MONITOR_MAX_MEMORY_MB: "not-a-number" },
    runCommand: runner([]),
    now: fixedNow,
  });

  assert.equal(invalidExpected.exitCode, 2);
  assert.equal(invalidExpected.payload.status, "configuration_error");
  assert.equal(invalidNumber.exitCode, 2);
  assert.equal(invalidNumber.payload.status, "configuration_error");
});

test("PM2 status CLI passes configured timeout and returns JSON-only compatible payload", async () => {
  const result = await runPm2StatusCli({
    env: {
      PM2_MONITOR_EXPECTED_PROCESSES: "clinova, clinova, clinova-backup",
      PM2_MONITOR_TIMEOUT_MS: "250",
    },
    runCommand: async ({ timeoutMs }) => {
      assert.equal(timeoutMs, 250);
      return JSON.stringify([fixture("clinova"), fixture("clinova-backup")]);
    },
    now: fixedNow,
  });
  const serialized = JSON.stringify(result.payload);

  assert.deepEqual(JSON.parse(serialized), result.payload);
  assert.equal(result.payload.checkedAt, fixedNow.toISOString());
  assert.equal(serialized.includes("pm2_env"), false);
});

test("PM2 status CLI alert log mode wraps healthy status with no-alert payload", async () => {
  const result = await runPm2StatusCli({
    env: { PM2_MONITOR_ALERT_MODE: "log" },
    runCommand: runner([fixture("clinova"), fixture("clinova-backup")]),
    now: fixedNow,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.payload.pm2.status, "healthy");
  assert.equal(result.payload.alert.shouldAlert, false);
  assert.equal(result.payload.alert.alertType, "none");
  assert.equal(result.payload.alert.delivery, "none");
});

test("PM2 status CLI alert log mode reports degraded warning", async () => {
  const result = await runPm2StatusCli({
    env: {
      PM2_MONITOR_ALERT_MODE: "log",
      PM2_MONITOR_EXPECTED_PROCESSES: "clinova",
      PM2_MONITOR_MAX_RESTART_COUNT: "3",
    },
    runCommand: runner([fixture("clinova", { pm2_env: { restart_time: 4 } })]),
    now: fixedNow,
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.payload.pm2.status, "degraded");
  assert.equal(result.payload.alert.alertType, "pm2_degraded");
  assert.equal(result.payload.alert.severity, "warning");
});

for (const status of ["offline", "missing"]) {
  test(`PM2 status CLI alert log mode reports critical down alert for ${status}`, async () => {
    const env = status === "offline"
      ? { PM2_MONITOR_ALERT_MODE: "log", PM2_MONITOR_EXPECTED_PROCESSES: "clinova" }
      : { PM2_MONITOR_ALERT_MODE: "log" };
    const processes = status === "offline"
      ? [fixture("clinova", { pm2_env: { status: "stopped" } })]
      : [fixture("clinova")];
    const result = await runPm2StatusCli({
      env,
      runCommand: runner(processes),
      now: fixedNow,
    });

    assert.equal(result.exitCode, 1);
    assert.equal(result.payload.pm2.status, status);
    assert.equal(result.payload.alert.alertType, "pm2_down");
    assert.equal(result.payload.alert.severity, "critical");
  });
}

test("PM2 status CLI alert log mode suppresses repeated bad status without changing exit code", async () => {
  const result = await runPm2StatusCli({
    env: {
      PM2_MONITOR_ALERT_MODE: "log",
      PM2_MONITOR_EXPECTED_PROCESSES: "clinova",
      PM2_MONITOR_MAX_RESTART_COUNT: "3",
      PM2_MONITOR_PREVIOUS_STATUS: "degraded",
      PM2_MONITOR_PREVIOUS_ALERT_AT: "2035-01-02T11:30:00.000Z",
      PM2_MONITOR_DEDUPE_WINDOW_MINUTES: "60",
    },
    runCommand: runner([fixture("clinova", { pm2_env: { restart_time: 4 } })]),
    now: fixedNow,
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.payload.pm2.status, "degraded");
  assert.equal(result.payload.alert.shouldAlert, false);
  assert.equal(result.payload.alert.alertType, "none");
});

test("PM2 status CLI alert log mode emits recovery from offline to healthy", async () => {
  const result = await runPm2StatusCli({
    env: {
      PM2_MONITOR_ALERT_MODE: "log",
      PM2_MONITOR_PREVIOUS_STATUS: "offline",
      PM2_MONITOR_PREVIOUS_ALERT_AT: "2035-01-02T11:30:00.000Z",
    },
    runCommand: runner([fixture("clinova"), fixture("clinova-backup")]),
    now: fixedNow,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.payload.pm2.status, "healthy");
  assert.equal(result.payload.alert.shouldAlert, true);
  assert.equal(result.payload.alert.alertType, "pm2_recovery");
  assert.equal(result.payload.alert.severity, "info");
});

test("PM2 status CLI alert log mode wraps monitor failures and preserves exit code 2", async () => {
  const error = new Error("PM2 status command is unavailable.");
  error.code = "PM2_UNAVAILABLE";
  const result = await runPm2StatusCli({
    env: { PM2_MONITOR_ALERT_MODE: "log" },
    runCommand: async () => {
      throw error;
    },
    now: fixedNow,
  });

  assert.equal(result.exitCode, 2);
  assert.equal(result.payload.pm2.status, "monitor_error");
  assert.equal(result.payload.alert.alertType, "pm2_monitor_failure");
  assert.equal(result.payload.alert.severity, "critical");
});

test("PM2 status CLI invalid alert mode exits 2 with plain JSON error", async () => {
  const result = await runPm2StatusCli({
    env: { PM2_MONITOR_ALERT_MODE: "send" },
    runCommand: runner([]),
    now: fixedNow,
  });

  assert.equal(result.exitCode, 2);
  assert.equal(result.payload.status, "configuration_error");
  assert.match(result.payload.message, /must be off or log/);
  assert.equal(result.payload.pm2, undefined);
  assert.equal(result.payload.alert, undefined);
});
