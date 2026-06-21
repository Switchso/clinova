import { lstat, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const statusPriority = {
  healthy: 0,
  warning: 1,
  critical: 2,
  missing: 3,
  unreadable: 4,
};

function toDate(value, fallback = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function configuredThreshold(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function classifySize(sizeBytes, warningBytes, criticalBytes) {
  const warning = configuredThreshold(warningBytes);
  const critical = configuredThreshold(criticalBytes);
  if (critical !== null && sizeBytes >= critical) return "critical";
  if (warning !== null && sizeBytes >= warning) return "warning";
  return "healthy";
}

function statusMessage(status) {
  const messages = {
    healthy: "Storage path is within configured thresholds.",
    warning: "Storage path size reached the warning threshold.",
    critical: "Storage path size reached the critical threshold.",
    missing: "Storage path does not exist.",
    unreadable: "Storage path cannot be read.",
  };
  return messages[status];
}

async function measurePath(path) {
  const info = await lstat(path);
  if (info.isSymbolicLink()) return 0;
  if (info.isFile()) return info.size;
  if (!info.isDirectory()) return 0;

  const entries = await readdir(path, { withFileTypes: true });
  let total = 0;
  for (const entry of entries) {
    total += await measurePath(resolve(path, entry.name));
  }
  return total;
}

export async function getDirectorySizeBytes(path) {
  return measurePath(resolve(String(path || "")));
}

export async function analyzeDiskUsagePaths(paths, options = {}) {
  const {
    warningBytes,
    criticalBytes,
    showPaths = false,
    now = new Date(),
  } = options;
  const checkedAt = toDate(now).toISOString();
  const definitions = Array.isArray(paths) ? paths : [];
  const results = [];

  for (const definition of definitions) {
    const label = String(definition?.label || "").trim();
    const resolvedPath = resolve(String(definition?.path || ""));
    const pathWarningBytes = definition?.warningBytes ?? warningBytes;
    const pathCriticalBytes = definition?.criticalBytes ?? criticalBytes;

    try {
      const sizeBytes = await getDirectorySizeBytes(resolvedPath);
      const status = classifySize(sizeBytes, pathWarningBytes, pathCriticalBytes);
      results.push({
        label,
        exists: true,
        status,
        sizeBytes,
        sizeMb: Number((sizeBytes / (1024 * 1024)).toFixed(2)),
        ...(showPaths ? { path: resolvedPath } : {}),
        message: statusMessage(status),
      });
    } catch (error) {
      const status = error?.code === "ENOENT" ? "missing" : "unreadable";
      results.push({
        label,
        exists: status !== "missing",
        status,
        sizeBytes: null,
        sizeMb: null,
        ...(showPaths ? { path: resolvedPath } : {}),
        message: statusMessage(status),
      });
    }
  }

  const status = results.reduce(
    (worst, item) => statusPriority[item.status] > statusPriority[worst] ? item.status : worst,
    "healthy"
  );

  return {
    ok: status === "healthy",
    status,
    checkedAt,
    paths: results,
    message: status === "healthy"
      ? "All monitored storage paths are within configured thresholds."
      : "One or more monitored storage paths require attention.",
  };
}
