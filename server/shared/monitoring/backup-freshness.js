import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const defaultExtensions = [".sqlite", ".db", ".backup", ".dump"];
const defaultMaxAgeHours = 24;

function normalizeExtensions(extensions = defaultExtensions) {
  return new Set(extensions.map((extension) => String(extension || "").toLowerCase()));
}

function result({ ok, status, backupDir, checkedAt, maxAgeHours, message, latestBackupPath, latestBackupAgeHours }) {
  return {
    ok,
    status,
    ...(latestBackupPath ? { latestBackupPath } : {}),
    ...(Number.isFinite(latestBackupAgeHours) ? { latestBackupAgeHours } : {}),
    backupDir,
    checkedAt,
    maxAgeHours,
    message,
  };
}

function fileExtension(name) {
  const match = String(name || "").toLowerCase().match(/(\.[^.]+)$/);
  return match ? match[1] : "";
}

export async function checkBackupFreshness({
  backupDir,
  now = new Date(),
  maxAgeHours = defaultMaxAgeHours,
  includeExtensions = defaultExtensions,
} = {}) {
  const checkedAtDate = now instanceof Date ? now : new Date(now);
  const checkedAt = checkedAtDate.toISOString();
  const resolvedBackupDir = resolve(String(backupDir || ""));
  const extensionSet = normalizeExtensions(includeExtensions);

  let entries;
  try {
    entries = await readdir(resolvedBackupDir, { withFileTypes: true });
  } catch (error) {
    const status = error?.code === "ENOENT" ? "missing" : "unreadable";
    return result({
      ok: false,
      status,
      backupDir: resolvedBackupDir,
      checkedAt,
      maxAgeHours,
      message: status === "missing" ? "Backup directory is missing." : "Backup directory cannot be read.",
    });
  }

  const backups = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!extensionSet.has(fileExtension(entry.name))) continue;
    const path = resolve(resolvedBackupDir, entry.name);
    const info = await stat(path);
    backups.push({ path, mtimeMs: info.mtimeMs });
  }

  if (backups.length === 0) {
    return result({
      ok: false,
      status: "missing",
      backupDir: resolvedBackupDir,
      checkedAt,
      maxAgeHours,
      message: "No backup files found.",
    });
  }

  backups.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const latest = backups[0];
  const latestBackupAgeHours = Math.max(0, (checkedAtDate.getTime() - latest.mtimeMs) / (1000 * 60 * 60));
  const isFresh = latestBackupAgeHours <= Number(maxAgeHours);

  return result({
    ok: isFresh,
    status: isFresh ? "fresh" : "stale",
    latestBackupPath: latest.path,
    latestBackupAgeHours,
    backupDir: resolvedBackupDir,
    checkedAt,
    maxAgeHours,
    message: isFresh ? "Latest backup is fresh." : "Latest backup is stale.",
  });
}
