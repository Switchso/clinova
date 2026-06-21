import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

export function readBackupFile(path) {
  return readFileSync(path);
}

export function ensureDirectory(path) {
  mkdirSync(path, { recursive: true });
}

export function writeBufferFile(path, buffer) {
  writeFileSync(path, buffer);
}

export function removeFile(path) {
  rmSync(path, { force: true });
}

export function copyFile(source, target) {
  copyFileSync(source, target);
}

export function writeJsonFile(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2));
}
