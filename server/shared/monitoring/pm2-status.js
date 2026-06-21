const defaultExpectedProcessNames = ["clinova", "clinova-backup"];

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toDate(value, fallback = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function processName(process) {
  return String(process?.name || process?.pm2_env?.name || "").trim();
}

function processStatus(process) {
  return String(process?.pm2_env?.status || process?.status || "unknown").toLowerCase();
}

function processStartTime(process) {
  const value = process?.pm2_env?.pm_uptime ?? process?.pm_uptime ?? process?.startedAt;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function configuredLimit(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function analyzePm2Process(process, options = {}) {
  const {
    minUptimeMinutes,
    maxRestartCount,
    maxMemoryMb,
    now = new Date(),
  } = options;
  const checkedAtDate = toDate(now);
  const name = processName(process);
  const pm2Status = processStatus(process);
  const restartCount = finiteNumber(process?.pm2_env?.restart_time ?? process?.restartCount, 0);
  const startTime = processStartTime(process);
  const uptimeMinutes = startTime === null
    ? null
    : Math.max(0, (checkedAtDate.getTime() - startTime) / (1000 * 60));
  const memoryBytes = finiteNumber(process?.monit?.memory ?? process?.memory, 0);
  const memoryMb = memoryBytes / (1024 * 1024);
  const cpuPercent = finiteNumber(process?.monit?.cpu ?? process?.cpu, 0);
  const issues = [];
  const restartLimit = configuredLimit(maxRestartCount);
  const uptimeLimit = configuredLimit(minUptimeMinutes);
  const memoryLimit = configuredLimit(maxMemoryMb);

  if (!name) issues.push("Process name is missing.");
  if (pm2Status !== "online") issues.push(`Process status is ${pm2Status}.`);
  if (restartLimit !== null && restartCount > restartLimit) {
    issues.push(`Restart count ${restartCount} exceeds limit ${restartLimit}.`);
  }
  const isRestarting =
    pm2Status === "online" &&
    uptimeLimit !== null &&
    uptimeMinutes !== null &&
    uptimeMinutes < uptimeLimit &&
    restartCount > 0;
  if (isRestarting) {
    issues.push(`Uptime ${uptimeMinutes.toFixed(2)} minutes is below limit ${uptimeLimit} after a restart.`);
  }
  if (memoryLimit !== null && memoryMb > memoryLimit) {
    issues.push(`Memory ${memoryMb.toFixed(2)} MB exceeds limit ${memoryLimit} MB.`);
  }

  let status = "healthy";
  if (!name || pm2Status === "unknown") status = "unhealthy";
  else if (pm2Status !== "online") status = "offline";
  else if (isRestarting) status = "restarting";
  else if (issues.length > 0) status = "degraded";

  return {
    name,
    status,
    ok: status === "healthy",
    restartCount,
    uptimeMinutes,
    memoryMb,
    cpuPercent,
    issues,
  };
}

export function analyzePm2ProcessList(processes, options = {}) {
  const {
    expectedProcessNames = defaultExpectedProcessNames,
    now = new Date(),
  } = options;
  const checkedAtDate = toDate(now);
  const expectedNames = Array.isArray(expectedProcessNames)
    ? [...new Set(expectedProcessNames.map((name) => String(name).trim()).filter(Boolean))]
    : [];

  if (!Array.isArray(processes)) {
    return {
      ok: false,
      status: "unhealthy",
      checkedAt: checkedAtDate.toISOString(),
      processes: [],
      missingProcesses: expectedNames,
      message: "PM2 process list is invalid.",
    };
  }

  const expectedSet = new Set(expectedNames);
  const relevantProcesses = processes.filter((process) => expectedSet.has(processName(process)));
  const analyzed = relevantProcesses.map((process) => analyzePm2Process(process, { ...options, now: checkedAtDate }));
  const presentNames = new Set(analyzed.map((process) => process.name));
  const missingProcesses = expectedNames.filter((name) => !presentNames.has(name));

  let status = "healthy";
  if (missingProcesses.length > 0) status = "missing";
  else if (analyzed.some((process) => process.status === "unhealthy")) status = "unhealthy";
  else if (analyzed.some((process) => process.status === "offline")) status = "offline";
  else if (analyzed.some((process) => process.status === "restarting")) status = "restarting";
  else if (analyzed.some((process) => process.status === "degraded")) status = "degraded";
  else if (expectedNames.length === 0 || analyzed.length === 0) status = "unhealthy";

  const messages = {
    healthy: "All expected PM2 processes are healthy.",
    degraded: "One or more PM2 processes are degraded.",
    missing: `Expected PM2 processes are missing: ${missingProcesses.join(", ")}.`,
    offline: "One or more PM2 processes are offline.",
    restarting: "One or more PM2 processes appear to be restarting.",
    unhealthy: "PM2 process status could not be evaluated as healthy.",
  };

  return {
    ok: status === "healthy",
    status,
    checkedAt: checkedAtDate.toISOString(),
    processes: analyzed,
    missingProcesses,
    message: messages[status],
  };
}
