import { basename } from "node:path";
import { config } from "../config.js";
import { buildBackupFreshnessAlert, createLogOnlyBackupAlertPayload } from "../shared/monitoring/backup-alerts.js";
import { checkBackupFreshness } from "../shared/monitoring/backup-freshness.js";

function parseBoolean(value) {
  return String(value || "").toLowerCase() === "true";
}

function parseMaxAgeHours(value) {
  if (value === undefined || value === "") return 24;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("BACKUP_FRESHNESS_MAX_AGE_HOURS must be a positive number.");
  }
  return parsed;
}

function parseExtensions(value) {
  if (!value) return undefined;
  const extensions = String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (item.startsWith(".") ? item : `.${item}`));
  if (extensions.length === 0) {
    throw new Error("BACKUP_FRESHNESS_EXTENSIONS must include at least one extension.");
  }
  return extensions;
}

function parseAlertMode(value) {
  const mode = String(value || "off").toLowerCase();
  if (mode === "off" || mode === "log") return mode;
  throw new Error("BACKUP_MONITOR_ALERT_MODE must be off or log.");
}

function parseDedupeWindowMinutes(value) {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("BACKUP_MONITOR_DEDUPE_WINDOW_MINUTES must be a positive number.");
  }
  return parsed;
}

function redactResult(result, showPaths) {
  const output = {
    ok: result.ok,
    status: result.status,
    checkedAt: result.checkedAt,
    maxAgeHours: result.maxAgeHours,
    message: result.message,
  };

  if (Number.isFinite(result.latestBackupAgeHours)) {
    output.latestBackupAgeHours = result.latestBackupAgeHours;
  }
  if (result.latestBackupPath) {
    output.latestBackupName = basename(result.latestBackupPath);
  }
  if (showPaths) {
    output.backupDir = result.backupDir;
    if (result.latestBackupPath) output.latestBackupPath = result.latestBackupPath;
  }

  return output;
}

function writeJson(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function buildAlertOutput(result, backupOutput, { previousStatus, previousAlertAt, dedupeWindowMinutes, showPaths }) {
  const alert = buildBackupFreshnessAlert(result, {
    previousStatus,
    previousAlertAt,
    ...(dedupeWindowMinutes ? { dedupeWindowMinutes } : {}),
    showPaths,
  });
  return {
    backup: backupOutput,
    alert: createLogOnlyBackupAlertPayload(alert),
  };
}

function configurationError(message, alertMode = "off") {
  const result = {
    ok: false,
    status: "configuration_error",
    checkedAt: new Date().toISOString(),
    message,
  };

  if (alertMode === "log") {
    return buildAlertOutput(result, result, {
      showPaths: parseBoolean(process.env.BACKUP_MONITOR_SHOW_PATHS),
      previousStatus: process.env.BACKUP_MONITOR_PREVIOUS_STATUS,
      previousAlertAt: process.env.BACKUP_MONITOR_PREVIOUS_ALERT_AT,
    });
  }

  return result;
}

async function main() {
  let alertMode = "off";
  try {
    alertMode = parseAlertMode(process.env.BACKUP_MONITOR_ALERT_MODE);
    const explicitBackupDir = process.env.BACKUP_DIR;
    if (explicitBackupDir !== undefined && explicitBackupDir.trim() === "") {
      throw new Error("BACKUP_DIR must not be empty when provided.");
    }

    const maxAgeHours = parseMaxAgeHours(process.env.BACKUP_FRESHNESS_MAX_AGE_HOURS);
    const includeExtensions = parseExtensions(process.env.BACKUP_FRESHNESS_EXTENSIONS);
    const showPaths = parseBoolean(process.env.BACKUP_FRESHNESS_SHOW_PATHS);
    const alertShowPaths = parseBoolean(process.env.BACKUP_MONITOR_SHOW_PATHS);
    const dedupeWindowMinutes = parseDedupeWindowMinutes(process.env.BACKUP_MONITOR_DEDUPE_WINDOW_MINUTES);
    const result = await checkBackupFreshness({
      backupDir: config.backup.dir,
      maxAgeHours,
      ...(includeExtensions ? { includeExtensions } : {}),
    });
    const backupOutput = redactResult(result, showPaths);

    if (alertMode === "log") {
      writeJson(
        buildAlertOutput(result, backupOutput, {
          previousStatus: process.env.BACKUP_MONITOR_PREVIOUS_STATUS,
          previousAlertAt: process.env.BACKUP_MONITOR_PREVIOUS_ALERT_AT,
          dedupeWindowMinutes,
          showPaths: alertShowPaths,
        })
      );
    } else {
      writeJson(backupOutput);
    }
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    writeJson(configurationError(error?.message || "Backup freshness check failed.", alertMode));
    process.exitCode = 2;
  }
}

await main();
