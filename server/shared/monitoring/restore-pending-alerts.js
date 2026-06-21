import { basename } from "node:path";

const badStatuses = new Set(["pending", "stale", "partial", "invalid", "unreadable"]);
const invalidStatuses = new Set(["partial", "invalid", "unreadable"]);
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
  if (status === "pending") return "restore_pending";
  if (status === "stale") return "restore_stale";
  if (invalidStatuses.has(status)) return "restore_invalid";
  return "none";
}

function severityFor(alertType) {
  if (alertType === "restore_pending") return "warning";
  if (alertType === "restore_stale" || alertType === "restore_invalid") return "critical";
  return "info";
}

function safeMetadata(metadata, showPaths) {
  if (!metadata || typeof metadata !== "object") return undefined;

  const summary = {
    uploadedName: metadata.uploadedName,
    requestedBy: metadata.requestedBy,
    createdAt: metadata.createdAt,
    source: metadata.source,
    safetyBackup: metadata.safetyBackup,
  };

  if (!showPaths) {
    if (typeof summary.source === "string") summary.source = basename(summary.source);
    if (typeof summary.safetyBackup === "string") summary.safetyBackup = basename(summary.safetyBackup);
  }

  const filtered = Object.fromEntries(Object.entries(summary).filter(([, value]) => value !== undefined));
  return Object.keys(filtered).length > 0 ? filtered : undefined;
}

function safeDetailsFor(result, showPaths) {
  const details = {
    checkedAt: result.checkedAt,
    staleAfterMinutes: result.staleAfterMinutes,
    pendingAgeMinutes: Number.isFinite(result.pendingAgeMinutes) ? result.pendingAgeMinutes : null,
    hasPendingSqlite: Boolean(result.hasPendingSqlite),
    hasPendingJson: Boolean(result.hasPendingJson),
  };
  const metadata = safeMetadata(result.metadata, showPaths);
  if (metadata) details.metadata = metadata;

  if (showPaths) {
    if (result.backupDir) details.backupDir = result.backupDir;
    if (result.paths && typeof result.paths === "object") details.paths = { ...result.paths };
  }

  return Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined));
}

export function buildRestorePendingAlert(currentResult, options = {}) {
  const {
    previousStatus,
    previousAlertAt,
    now = new Date(),
    dedupeWindowMinutes = defaultDedupeWindowMinutes,
    showPaths = false,
  } = options;
  const createdAtDate = toDate(now);
  const status = currentResult?.status || "unreadable";
  const isNone = status === "none";
  const wasBad = badStatuses.has(previousStatus);

  let alertType = "none";
  let shouldAlert = false;

  if (isNone && wasBad) {
    alertType = "restore_recovery";
    shouldAlert = true;
  } else if (badStatuses.has(status)) {
    alertType = alertTypeFor(status);
    shouldAlert = true;
  }

  if (
    shouldAlert &&
    alertType !== "restore_recovery" &&
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
    message: currentResult?.message || "Restore pending monitor reported a problem.",
    safeDetails: safeDetailsFor(currentResult || {}, showPaths),
    createdAt: createdAtDate.toISOString(),
  };
}

export function createLogOnlyRestorePendingAlertPayload(alert) {
  return {
    channel: "log_only",
    delivery: "none",
    check: "restore_pending",
    shouldAlert: alert.shouldAlert,
    alertType: alert.alertType,
    severity: alert.severity,
    status: alert.status,
    message: alert.message,
    safeDetails: alert.safeDetails,
    createdAt: alert.createdAt,
  };
}
