import { config } from "../config.js";
import {
  buildRestorePendingAlert,
  createLogOnlyRestorePendingAlertPayload,
} from "../shared/monitoring/restore-pending-alerts.js";
import { checkRestorePendingMarker } from "../shared/monitoring/restore-pending.js";

function parseBoolean(value) {
  return String(value || "").toLowerCase() === "true";
}

function parseStaleAfterMinutes(value) {
  if (value === undefined || value === "") return 30;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("RESTORE_PENDING_STALE_AFTER_MINUTES must be a positive number.");
  }
  return parsed;
}

function parseAlertMode(value) {
  const mode = String(value || "off").toLowerCase();
  if (mode === "off" || mode === "log") return mode;
  throw new Error("RESTORE_PENDING_ALERT_MODE must be off or log.");
}

function parseDedupeWindowMinutes(value) {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("RESTORE_PENDING_DEDUPE_WINDOW_MINUTES must be a positive number.");
  }
  return parsed;
}

function redactResult(result, showPaths) {
  return {
    ok: result.ok,
    status: result.status,
    checkedAt: result.checkedAt,
    staleAfterMinutes: result.staleAfterMinutes,
    pendingAgeMinutes: result.pendingAgeMinutes,
    hasPendingSqlite: result.hasPendingSqlite,
    hasPendingJson: result.hasPendingJson,
    message: result.message,
    ...(result.metadata ? { metadata: result.metadata } : {}),
    ...(showPaths ? { backupDir: result.backupDir, paths: result.paths } : {}),
  };
}

function writeJson(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function buildAlertOutput(result, restoreOutput, { previousStatus, previousAlertAt, dedupeWindowMinutes, showPaths }) {
  const alert = buildRestorePendingAlert(result, {
    previousStatus,
    previousAlertAt,
    ...(dedupeWindowMinutes ? { dedupeWindowMinutes } : {}),
    showPaths,
  });
  return {
    restore: restoreOutput,
    alert: createLogOnlyRestorePendingAlertPayload(alert),
  };
}

async function main() {
  try {
    const alertMode = parseAlertMode(process.env.RESTORE_PENDING_ALERT_MODE);
    const explicitBackupDir = process.env.BACKUP_DIR;
    if (explicitBackupDir !== undefined && explicitBackupDir.trim() === "") {
      throw new Error("BACKUP_DIR must not be empty when provided.");
    }

    const staleAfterMinutes = parseStaleAfterMinutes(process.env.RESTORE_PENDING_STALE_AFTER_MINUTES);
    const dedupeWindowMinutes = parseDedupeWindowMinutes(process.env.RESTORE_PENDING_DEDUPE_WINDOW_MINUTES);
    const showPaths = parseBoolean(process.env.RESTORE_PENDING_SHOW_PATHS);
    const result = await checkRestorePendingMarker({
      backupDir: config.backup.dir,
      staleAfterMinutes,
      showPaths,
    });
    const restoreOutput = redactResult(result, showPaths);

    if (alertMode === "log") {
      writeJson(
        buildAlertOutput(result, restoreOutput, {
          previousStatus: process.env.RESTORE_PENDING_PREVIOUS_STATUS,
          previousAlertAt: process.env.RESTORE_PENDING_PREVIOUS_ALERT_AT,
          dedupeWindowMinutes,
          showPaths,
        })
      );
    } else {
      writeJson(restoreOutput);
    }
    process.exitCode = result.status === "none" ? 0 : 1;
  } catch (error) {
    writeJson({
      ok: false,
      status: "configuration_error",
      checkedAt: new Date().toISOString(),
      message: error?.message || "Restore pending marker check failed.",
    });
    process.exitCode = 2;
  }
}

await main();
