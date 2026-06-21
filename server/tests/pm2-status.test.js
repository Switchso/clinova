import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzePm2Process, analyzePm2ProcessList } from "../shared/monitoring/pm2-status.js";

const fixedNow = new Date("2035-01-02T12:00:00.000Z");

function fixture(name, overrides = {}) {
  return {
    name,
    pm2_env: {
      status: "online",
      restart_time: 0,
      pm_uptime: fixedNow.getTime() - 120 * 60 * 1000,
      ...overrides.pm2_env,
    },
    monit: {
      memory: 100 * 1024 * 1024,
      cpu: 2.5,
      ...overrides.monit,
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !["pm2_env", "monit"].includes(key))),
  };
}

test("PM2 status checker reports healthy single process", () => {
  const result = analyzePm2ProcessList([fixture("clinova")], {
    expectedProcessNames: ["clinova"],
    now: fixedNow,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "healthy");
  assert.equal(result.processes[0].uptimeMinutes, 120);
  assert.equal(result.processes[0].memoryMb, 100);
  assert.equal(result.processes[0].cpuPercent, 2.5);
});

test("PM2 status checker reports healthy multiple expected processes", () => {
  const result = analyzePm2ProcessList([fixture("clinova"), fixture("clinova-backup")], {
    expectedProcessNames: ["clinova", "clinova-backup"],
    now: fixedNow,
  });

  assert.equal(result.ok, true);
  assert.equal(result.processes.length, 2);
  assert.deepEqual(result.missingProcesses, []);
});

test("PM2 status checker reports missing expected process", () => {
  const result = analyzePm2ProcessList([fixture("clinova")], {
    expectedProcessNames: ["clinova", "clinova-backup"],
    now: fixedNow,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "missing");
  assert.deepEqual(result.missingProcesses, ["clinova-backup"]);
});

test("PM2 status checker reports offline process", () => {
  const result = analyzePm2ProcessList(
    [fixture("clinova", { pm2_env: { status: "stopped" } })],
    { expectedProcessNames: ["clinova"], now: fixedNow }
  );

  assert.equal(result.status, "offline");
  assert.equal(result.processes[0].status, "offline");
  assert.match(result.processes[0].issues[0], /stopped/);
});

test("PM2 status checker reports degraded restart count", () => {
  const process = analyzePm2Process(
    fixture("clinova", { pm2_env: { restart_time: 4 } }),
    { maxRestartCount: 3, now: fixedNow }
  );

  assert.equal(process.status, "degraded");
  assert.match(process.issues[0], /exceeds limit/);
});

test("PM2 status checker reports restarting for low uptime after restart", () => {
  const result = analyzePm2ProcessList(
    [
      fixture("clinova", {
        pm2_env: {
          restart_time: 1,
          pm_uptime: fixedNow.getTime() - 2 * 60 * 1000,
        },
      }),
    ],
    {
      expectedProcessNames: ["clinova"],
      minUptimeMinutes: 10,
      now: fixedNow,
    }
  );

  assert.equal(result.status, "restarting");
  assert.equal(result.processes[0].status, "restarting");
});

test("PM2 status checker reports degraded high memory usage", () => {
  const result = analyzePm2ProcessList(
    [fixture("clinova", { monit: { memory: 350 * 1024 * 1024 } })],
    {
      expectedProcessNames: ["clinova"],
      maxMemoryMb: 300,
      now: fixedNow,
    }
  );

  assert.equal(result.status, "degraded");
  assert.equal(result.processes[0].memoryMb, 350);
});

test("PM2 status checker handles malformed and empty output safely", () => {
  const malformed = analyzePm2ProcessList(null, {
    expectedProcessNames: ["clinova"],
    now: fixedNow,
  });
  const empty = analyzePm2ProcessList([], {
    expectedProcessNames: ["clinova"],
    now: fixedNow,
  });

  assert.equal(malformed.status, "unhealthy");
  assert.equal(malformed.ok, false);
  assert.equal(empty.status, "missing");
  assert.deepEqual(empty.missingProcesses, ["clinova"]);
});

test("PM2 status checker uses deterministic now and ignores unrelated processes", () => {
  const result = analyzePm2ProcessList(
    [
      fixture("clinova", { pm2_env: { pm_uptime: fixedNow.getTime() - 45 * 60 * 1000 } }),
      fixture("unrelated-worker"),
    ],
    {
      expectedProcessNames: ["clinova"],
      now: fixedNow,
    }
  );

  assert.equal(result.checkedAt, fixedNow.toISOString());
  assert.equal(result.processes.length, 1);
  assert.equal(result.processes[0].name, "clinova");
  assert.equal(result.processes[0].uptimeMinutes, 45);
});
