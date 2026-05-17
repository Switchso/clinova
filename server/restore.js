import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config } from "./config.js";
import { createBackup } from "./backup.js";

const sourceArg = process.argv[2];
if (!sourceArg) {
  console.error("Usage: node server/restore.js <backup-file>");
  process.exit(1);
}

const source = resolve(sourceArg);
if (!existsSync(source)) {
  console.error(`Backup file not found: ${source}`);
  process.exit(1);
}

mkdirSync(dirname(config.databasePath), { recursive: true });
const safety = createBackup({ reason: "before-cli-restore" });
copyFileSync(source, config.databasePath);
console.log(`Database restored from: ${source}`);
console.log(`Database path: ${config.databasePath}`);
console.log(`Safety backup before restore: ${safety.target}`);
