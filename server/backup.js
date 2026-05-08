import { copyFileSync, mkdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { config } from "./config.js";

const backupDir = resolve("backups");
mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = resolve(backupDir, `${basename(config.databasePath)}.${stamp}.bak`);
copyFileSync(config.databasePath, target);
console.log(`Backup created: ${target}`);
