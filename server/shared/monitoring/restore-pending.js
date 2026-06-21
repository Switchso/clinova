import { readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";

const defaultStaleAfterMinutes = 30;

function result({
  ok,
  status,
  backupDir,
  checkedAt,
  staleAfterMinutes,
  pendingAgeMinutes = null,
  hasPendingSqlite = false,
  hasPendingJson = false,
  metadata,
  message,
  paths,
}) {
  return {
    ok,
    status,
    backupDir,
    checkedAt,
    staleAfterMinutes,
    pendingAgeMinutes,
    hasPendingSqlite,
    hasPendingJson,
    ...(metadata ? { metadata } : {}),
    ...(paths ? { paths } : {}),
    message,
  };
}

function safeMetadata(metadata, showPaths) {
  if (!metadata || typeof metadata !== "object") return undefined;
  const output = { ...metadata };
  if (!showPaths && typeof output.source === "string") output.source = basename(output.source);
  if (!showPaths && typeof output.safetyBackup === "string") output.safetyBackup = basename(output.safetyBackup);
  return output;
}

function ageFrom(metadata, sqliteInfo, jsonInfo, checkedAtDate) {
  const createdAt = metadata?.createdAt ? new Date(metadata.createdAt) : null;
  const reference = createdAt && !Number.isNaN(createdAt.getTime())
    ? createdAt.getTime()
    : Math.min(sqliteInfo?.mtimeMs ?? Infinity, jsonInfo?.mtimeMs ?? Infinity);
  if (!Number.isFinite(reference)) return null;
  return Math.max(0, (checkedAtDate.getTime() - reference) / (1000 * 60));
}

async function fileInfo(path) {
  try {
    const info = await stat(path);
    return info.isFile() ? info : null;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function checkRestorePendingMarker({
  backupDir,
  now = new Date(),
  staleAfterMinutes = defaultStaleAfterMinutes,
  showPaths = false,
} = {}) {
  const checkedAtDate = now instanceof Date ? now : new Date(now);
  const checkedAt = checkedAtDate.toISOString();
  const resolvedBackupDir = resolve(String(backupDir || ""));
  const pendingSqlitePath = resolve(resolvedBackupDir, "pending-restore.sqlite");
  const pendingJsonPath = resolve(resolvedBackupDir, "pending-restore.json");

  try {
    const dirInfo = await stat(resolvedBackupDir);
    if (!dirInfo.isDirectory()) {
      return result({
        ok: false,
        status: "unreadable",
        backupDir: resolvedBackupDir,
        checkedAt,
        staleAfterMinutes,
        message: "Backup path is not a directory.",
      });
    }
  } catch {
    return result({
      ok: false,
      status: "unreadable",
      backupDir: resolvedBackupDir,
      checkedAt,
      staleAfterMinutes,
      message: "Backup directory cannot be read.",
    });
  }

  let sqliteInfo;
  let jsonInfo;
  try {
    [sqliteInfo, jsonInfo] = await Promise.all([fileInfo(pendingSqlitePath), fileInfo(pendingJsonPath)]);
  } catch {
    return result({
      ok: false,
      status: "unreadable",
      backupDir: resolvedBackupDir,
      checkedAt,
      staleAfterMinutes,
      message: "Pending restore marker files cannot be read.",
    });
  }

  const hasPendingSqlite = Boolean(sqliteInfo);
  const hasPendingJson = Boolean(jsonInfo);
  const paths = showPaths
    ? {
        pendingSqlitePath,
        pendingJsonPath,
      }
    : undefined;

  if (!hasPendingSqlite && !hasPendingJson) {
    return result({
      ok: true,
      status: "none",
      backupDir: resolvedBackupDir,
      checkedAt,
      staleAfterMinutes,
      hasPendingSqlite,
      hasPendingJson,
      message: "No pending restore marker found.",
      paths,
    });
  }

  if (hasPendingSqlite !== hasPendingJson) {
    return result({
      ok: false,
      status: "partial",
      backupDir: resolvedBackupDir,
      checkedAt,
      staleAfterMinutes,
      hasPendingSqlite,
      hasPendingJson,
      message: "Incomplete pending restore marker found.",
      paths,
    });
  }

  let metadata;
  try {
    metadata = JSON.parse(await readFile(pendingJsonPath, "utf8"));
  } catch {
    return result({
      ok: false,
      status: "invalid",
      backupDir: resolvedBackupDir,
      checkedAt,
      staleAfterMinutes,
      hasPendingSqlite,
      hasPendingJson,
      message: "Pending restore metadata is invalid JSON.",
      paths,
    });
  }

  if (!metadata?.createdAt || Number.isNaN(new Date(metadata.createdAt).getTime())) {
    return result({
      ok: false,
      status: "invalid",
      backupDir: resolvedBackupDir,
      checkedAt,
      staleAfterMinutes,
      hasPendingSqlite,
      hasPendingJson,
      metadata: safeMetadata(metadata, showPaths),
      message: "Pending restore metadata is missing a valid createdAt timestamp.",
      paths,
    });
  }

  const pendingAgeMinutes = ageFrom(metadata, sqliteInfo, jsonInfo, checkedAtDate);
  const isStale = Number.isFinite(pendingAgeMinutes) && pendingAgeMinutes > Number(staleAfterMinutes);

  return result({
    ok: false,
    status: isStale ? "stale" : "pending",
    backupDir: resolvedBackupDir,
    checkedAt,
    staleAfterMinutes,
    pendingAgeMinutes,
    hasPendingSqlite,
    hasPendingJson,
    metadata: safeMetadata(metadata, showPaths),
    message: isStale ? "Pending restore marker is stale." : "Pending restore marker found.",
    paths,
  });
}
