import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildPm2StatusAlert,
  createLogOnlyPm2StatusAlertPayload,
} from "../shared/monitoring/pm2-alerts.js";
import { analyzePm2ProcessList } from "../shared/monitoring/pm2-status.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const pm2ScriptPath = resolve(repoRoot, "node_modules/pm2/bin/pm2");
const maxOutputBytes = 2 * 1024 * 1024;

function parseExpectedProcesses(value) {
  const names = String(value || "clinova,clinova-backup")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const unique = [...new Set(names)];
  if (unique.length === 0) {
    throw new Error("PM2_MONITOR_EXPECTED_PROCESSES must include at least one process name.");
  }
  return unique;
}

function parseNonNegativeNumber(value, defaultValue, name) {
  if (value === undefined || value === "") return defaultValue;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number.`);
  }
  return parsed;
}

function parsePositiveInteger(value, defaultValue, name) {
  if (value === undefined || value === "") return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function parseAlertMode(value) {
  const mode = String(value || "off").toLowerCase();
  if (mode === "off" || mode === "log") return mode;
  throw new Error("PM2_MONITOR_ALERT_MODE must be off or log.");
}

function parseDedupeWindowMinutes(value) {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("PM2_MONITOR_DEDUPE_WINDOW_MINUTES must be a positive number.");
  }
  return parsed;
}

function safeErrorPayload(message, status = "monitor_error", now = new Date()) {
  return {
    ok: false,
    status,
    checkedAt: now.toISOString(),
    message,
  };
}

function buildAlertOutput(pm2Result, {
  previousStatus,
  previousAlertAt,
  dedupeWindowMinutes,
  now,
}) {
  const alert = buildPm2StatusAlert(pm2Result, {
    previousStatus,
    previousAlertAt,
    ...(dedupeWindowMinutes ? { dedupeWindowMinutes } : {}),
    now,
  });
  return {
    pm2: pm2Result,
    alert: createLogOnlyPm2StatusAlertPayload(alert),
  };
}

function outputForMode(pm2Result, alertMode, alertOptions) {
  return alertMode === "log"
    ? buildAlertOutput(pm2Result, alertOptions)
    : pm2Result;
}

export function runPm2Jlist({ timeoutMs = 5000 } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [pm2ScriptPath, "jlist"], {
      cwd: repoRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };

    const timer = setTimeout(() => {
      child.kill();
      const error = new Error("PM2 status command timed out.");
      error.code = "PM2_TIMEOUT";
      finish(rejectRun, error);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout) > maxOutputBytes) {
        child.kill();
        const error = new Error("PM2 status output exceeded the allowed size.");
        error.code = "PM2_OUTPUT_TOO_LARGE";
        finish(rejectRun, error);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (Buffer.byteLength(stderr) > maxOutputBytes) {
        child.kill();
        const error = new Error("PM2 error output exceeded the allowed size.");
        error.code = "PM2_OUTPUT_TOO_LARGE";
        finish(rejectRun, error);
      }
    });
    child.on("error", () => {
      const error = new Error("PM2 status command is unavailable.");
      error.code = "PM2_UNAVAILABLE";
      finish(rejectRun, error);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        const error = new Error("PM2 status command failed.");
        error.code = "PM2_COMMAND_FAILED";
        finish(rejectRun, error);
        return;
      }
      finish(resolveRun, stdout);
    });
  });
}

export async function runPm2StatusCli({
  env = process.env,
  runCommand = runPm2Jlist,
  now = new Date(),
} = {}) {
  let alertMode = "off";
  try {
    alertMode = parseAlertMode(env.PM2_MONITOR_ALERT_MODE);
    const dedupeWindowMinutes = parseDedupeWindowMinutes(env.PM2_MONITOR_DEDUPE_WINDOW_MINUTES);
    const alertOptions = {
      previousStatus: env.PM2_MONITOR_PREVIOUS_STATUS,
      previousAlertAt: env.PM2_MONITOR_PREVIOUS_ALERT_AT,
      dedupeWindowMinutes,
      now,
    };
    const expectedProcessNames = parseExpectedProcesses(env.PM2_MONITOR_EXPECTED_PROCESSES);
    const minUptimeMinutes = parseNonNegativeNumber(
      env.PM2_MONITOR_MIN_UPTIME_MINUTES,
      5,
      "PM2_MONITOR_MIN_UPTIME_MINUTES"
    );
    const maxRestartCount = parseNonNegativeNumber(
      env.PM2_MONITOR_MAX_RESTART_COUNT,
      5,
      "PM2_MONITOR_MAX_RESTART_COUNT"
    );
    const maxMemoryMb = parseNonNegativeNumber(
      env.PM2_MONITOR_MAX_MEMORY_MB,
      512,
      "PM2_MONITOR_MAX_MEMORY_MB"
    );
    const timeoutMs = parsePositiveInteger(env.PM2_MONITOR_TIMEOUT_MS, 5000, "PM2_MONITOR_TIMEOUT_MS");
    const stdout = await runCommand({ timeoutMs });

    let processes;
    try {
      processes = JSON.parse(stdout);
    } catch {
      const pm2Result = safeErrorPayload("PM2 status command returned invalid JSON.", "monitor_error", now);
      return {
        exitCode: 2,
        payload: outputForMode(pm2Result, alertMode, alertOptions),
      };
    }

    const pm2Result = analyzePm2ProcessList(processes, {
      expectedProcessNames,
      minUptimeMinutes,
      maxRestartCount,
      maxMemoryMb,
      now,
    });
    return {
      exitCode: pm2Result.ok ? 0 : 1,
      payload: outputForMode(pm2Result, alertMode, alertOptions),
    };
  } catch (error) {
    const isConfigurationError = !String(error?.code || "").startsWith("PM2_");
    const pm2Result = safeErrorPayload(
      error?.message || "PM2 status check failed.",
      isConfigurationError ? "configuration_error" : "monitor_error",
      now
    );
    return {
      exitCode: 2,
      payload: outputForMode(pm2Result, alertMode, {
        previousStatus: env.PM2_MONITOR_PREVIOUS_STATUS,
        previousAlertAt: env.PM2_MONITOR_PREVIOUS_ALERT_AT,
        now,
      }),
    };
  }
}

async function main() {
  const result = await runPm2StatusCli();
  process.stdout.write(`${JSON.stringify(result.payload)}\n`);
  process.exitCode = result.exitCode;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  await main();
}
