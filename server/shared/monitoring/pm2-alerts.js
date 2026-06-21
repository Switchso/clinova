const badStatuses = new Set([
  "degraded",
  "restarting",
  "missing",
  "offline",
  "unhealthy",
  "configuration_error",
  "monitor_error",
]);
const monitorFailureStatuses = new Set(["configuration_error", "monitor_error"]);
const downStatuses = new Set(["missing", "offline", "unhealthy"]);
const defaultDedupeWindowMinutes = 60;

function toDate(value, fallback = new Date()) {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function isInsideDedupeWindow({ previousAlertAt, now, dedupeWindowMinutes }) {
  if (!previousAlertAt) return false;
  const previous = toDate(previousAlertAt, null);
  if (!previous) return false;
  const elapsedMinutes = (now.getTime() - previous.getTime()) / (1000 * 60);
  return elapsedMinutes >= 0 && elapsedMinutes < dedupeWindowMinutes;
}

function alertTypeFor(status) {
  if (status === "degraded" || status === "restarting") return "pm2_degraded";
  if (downStatuses.has(status)) return "pm2_down";
  if (monitorFailureStatuses.has(status)) return "pm2_monitor_failure";
  return "none";
}

function severityFor(alertType) {
  if (alertType === "pm2_degraded") return "warning";
  if (alertType === "pm2_down" || alertType === "pm2_monitor_failure") return "critical";
  return "info";
}

function safeProcessSummary(process) {
  const summary = {
    name: process?.name,
    status: process?.status,
    restartCount: process?.restartCount,
    uptimeMinutes: process?.uptimeMinutes,
    memoryMb: process?.memoryMb,
    cpuPercent: process?.cpuPercent,
    issues: Array.isArray(process?.issues)
      ? process.issues.filter((issue) => typeof issue === "string")
      : [],
  };

  return Object.fromEntries(Object.entries(summary).filter(([, value]) => value !== undefined));
}

function safeDetailsFor(result) {
  return {
    checkedAt: result?.checkedAt,
    missingProcesses: Array.isArray(result?.missingProcesses)
      ? result.missingProcesses.filter((name) => typeof name === "string")
      : [],
    processes: Array.isArray(result?.processes)
      ? result.processes.map(safeProcessSummary)
      : [],
  };
}

export function buildPm2StatusAlert(currentResult, options = {}) {
  const {
    previousStatus,
    previousAlertAt,
    now = new Date(),
    dedupeWindowMinutes = defaultDedupeWindowMinutes,
  } = options;
  const createdAtDate = toDate(now);
  const status = currentResult?.status || "monitor_error";
  const isHealthy = status === "healthy" && currentResult?.ok !== false;
  const wasBad = badStatuses.has(previousStatus);

  let alertType = "none";
  let shouldAlert = false;

  if (isHealthy && wasBad) {
    alertType = "pm2_recovery";
    shouldAlert = true;
  } else if (badStatuses.has(status)) {
    alertType = alertTypeFor(status);
    shouldAlert = true;
  } else if (!isHealthy && currentResult?.ok === false) {
    alertType = "pm2_monitor_failure";
    shouldAlert = true;
  }

  if (
    shouldAlert &&
    alertType !== "pm2_recovery" &&
    previousStatus === status &&
    isInsideDedupeWindow({ previousAlertAt, now: createdAtDate, dedupeWindowMinutes })
  ) {
    alertType = "none";
    shouldAlert = false;
  }

  return {
    shouldAlert,
    alertType,
    severity: severityFor(alertType),
    status,
    message: currentResult?.message || "PM2 status monitor reported a problem.",
    safeDetails: safeDetailsFor(currentResult),
    createdAt: createdAtDate.toISOString(),
  };
}

export function createLogOnlyPm2StatusAlertPayload(alert) {
  return {
    channel: "log_only",
    delivery: "none",
    check: "pm2_status",
    shouldAlert: alert.shouldAlert,
    alertType: alert.alertType,
    severity: alert.severity,
    status: alert.status,
    message: alert.message,
    safeDetails: alert.safeDetails,
    createdAt: alert.createdAt,
  };
}
