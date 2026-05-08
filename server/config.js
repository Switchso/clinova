import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

if (existsSync(".env")) {
  const lines = readFileSync(".env", "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

export const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || "0.0.0.0",
  databasePath: resolve(process.env.DATABASE_PATH || "./data/clinic.sqlite"),
  sessionSecret: process.env.SESSION_SECRET || "dev-only-change-me",
  cookieSecure: String(process.env.COOKIE_SECURE || "false").toLowerCase() === "true",
};
