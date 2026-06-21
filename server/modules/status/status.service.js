import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { databaseEngine, db } from "../../db.js";

const packageInfo = JSON.parse(readFileSync(resolve("package.json"), "utf8"));

export async function health() {
  const dbCheck = await db.prepare("SELECT 1 AS ok").get();
  const checks = {
    database: Boolean(dbCheck?.ok),
    databaseEngine,
    time: new Date().toISOString(),
  };
  return { status: 200, body: { ok: checks.database, version: packageInfo.version, checks } };
}

export async function version() {
  return {
    status: 200,
    body: {
      name: "Clinova",
      version: packageInfo.version,
      node: process.version,
      environment: process.env.NODE_ENV || "development",
    },
  };
}
