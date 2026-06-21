import { basename } from "node:path";

const badStatuses = new Set(["stale", "missing", "unreadable"]);
const defaultDedupeWindowMinutes = 720;

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

function severityFor(alertType, status) {
  if (alertType === "none") return "info";
  if (alertType === "recovery") return "info";
  if (alertType === "monitor_failure") return "critical";
  if (status === "stale") return "warning";
  return "critical";
}

function safeDetailsFor(result, showPaths) {
  const details = {
    checkedAt: result.checkedAt,
    maxAgeHours: result.maxAgeHours,
  };

  if (Number.isFinite(result.latestBackupAgeHours)) {
    details.latestBackupAgeHours = result.latestBackupAgeHours;
  }
  if (result.latestBackupPath) {
    details.latestBackupName = basename(result.latestBackupPath);
  }
  if (showPaths) {
    if (result.backupDir) details.backupDir = result.backupDir;
    if (result.latestBackupPath) details.latestBackupPath = result.latestBackupPath;
  }

  return Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined));
}

export function buildBackupFreshnessAlert(currentResult, options = {}) {
  const {
    previousStatus,
    previousAlertAt,
    now = new Date(),
    dedupeWindowMinutes = defaultDedupeWindowMinutes,
    showPaths = false,
  } = options;
  const createdAtDate = toDate(now);
  const status = currentResult?.status || "configuration_error";
  const isFresh = status === "fresh" || currentResult?.ok === true;
  const wasBad = previousStatus && previousStatus !== "fresh" && previousStatus !== "none";
  const isConfigError = status === "configuration_error";
  const isBad = badStatuses.has(status) || isConfigError || currentResult?.ok === false;

  let alertType = "none";
  let shouldAlert = false;

  if (isFresh && wasBad) {
    alertType = "recovery";
    shouldAlert = true;
  } else if (isConfigError) {
    alertType = "monitor_failure";
    shouldAlert = true;
  } else if (isBad && !isFresh) {
    alertType = "backup_failure";
    shouldAlert = true;
  }

  if (
    shouldAlert &&
    alertType !== "recovery" &&
    previousStatus === status &&
    isInsideDedupeWindow({ previousAlertAt, now: createdAtDate, dedupeWindowMinutes })
  ) {
    shouldAlert = false;
    alertType = "none";
  }

  return {
    shouldAlert,
    alertType,
    severity: severityFor(alertType, status),
    status,
    message: currentResult?.message || "Backup freshness monitor reported a problem.",
    safeDetails: safeDetailsFor(currentResult || {}, showPaths),
    createdAt: createdAtDate.toISOString(),
  };
}

export function createLogOnlyBackupAlertPayload(alert) {
  return {
    channel: "log_only",
    delivery: "none",
    check: "backup_freshness",
    shouldAlert: alert.shouldAlert,
    alertType: alert.alertType,
    severity: alert.severity,
    status: alert.status,
    message: alert.message,
    safeDetails: alert.safeDetails,
    createdAt: alert.createdAt,
  };
}
