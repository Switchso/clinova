import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { analyzeDiskUsagePaths } from "../shared/monitoring/disk-usage.js";

const maxPathDefinitions = 20;

function parseBoolean(value) {
  return String(value || "").toLowerCase() === "true";
}

function parseThreshold(value, name) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

function parsePathDefinitions(value) {
  if (value === undefined || String(value).trim() === "") {
    throw new Error("DISK_MONITOR_PATHS_JSON is required.");
  }

  let definitions;
  try {
    definitions = JSON.parse(value);
  } catch {
    throw new Error("DISK_MONITOR_PATHS_JSON must contain valid JSON.");
  }

  if (!Array.isArray(definitions) || definitions.length === 0) {
    throw new Error("DISK_MONITOR_PATHS_JSON must be a non-empty array.");
  }
  if (definitions.length > maxPathDefinitions) {
    throw new Error(`DISK_MONITOR_PATHS_JSON must contain at most ${maxPathDefinitions} paths.`);
  }

  const labels = new Set();
  return definitions.map((definition, index) => {
    if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
      throw new Error(`Disk monitor path entry ${index + 1} must be an object.`);
    }

    const label = typeof definition.label === "string" ? definition.label.trim() : "";
    const path = typeof definition.path === "string" ? definition.path.trim() : "";
    if (!label) throw new Error(`Disk monitor path entry ${index + 1} must include a label.`);
    if (!path) throw new Error(`Disk monitor path entry ${index + 1} must include a path.`);
    if (labels.has(label)) throw new Error(`Disk monitor path label "${label}" is duplicated.`);
    labels.add(label);

    const warningBytes = parseThreshold(definition.warningBytes, `warningBytes for "${label}"`);
    const criticalBytes = parseThreshold(definition.criticalBytes, `criticalBytes for "${label}"`);
    if (
      warningBytes !== undefined &&
      criticalBytes !== undefined &&
      criticalBytes < warningBytes
    ) {
      throw new Error(`criticalBytes for "${label}" must be greater than or equal to warningBytes.`);
    }

    return {
      label,
      path,
      ...(warningBytes !== undefined ? { warningBytes } : {}),
      ...(criticalBytes !== undefined ? { criticalBytes } : {}),
    };
  });
}

function configurationError(message, now) {
  return {
    ok: false,
    status: "configuration_error",
    checkedAt: now.toISOString(),
    message,
  };
}

export async function runDiskUsageCli({
  env = process.env,
  now = new Date(),
} = {}) {
  try {
    const paths = parsePathDefinitions(env.DISK_MONITOR_PATHS_JSON);
    const payload = await analyzeDiskUsagePaths(paths, {
      showPaths: parseBoolean(env.DISK_MONITOR_SHOW_PATHS),
      now,
    });
    return {
      exitCode: payload.ok ? 0 : 1,
      payload,
    };
  } catch (error) {
    return {
      exitCode: 2,
      payload: configurationError(error?.message || "Disk usage check failed.", now),
    };
  }
}

async function main() {
  const result = await runDiskUsageCli();
  process.stdout.write(`${JSON.stringify(result.payload)}\n`);
  process.exitCode = result.exitCode;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === pathToFileURL(fileURLToPath(import.meta.url)).href) {
  await main();
}
