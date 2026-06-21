import { checkDatabaseConnection, databaseEngine, db } from "./db.js";
import { config } from "./config.js";

try {
  const ok = await checkDatabaseConnection();
  if (!ok) throw new Error("Database returned an unexpected health response.");

  console.log(JSON.stringify({
    ok: true,
    databaseEngine,
    target: config.databaseUrl ? "DATABASE_URL" : config.databasePath,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    databaseEngine,
    target: config.databaseUrl ? "DATABASE_URL" : config.databasePath,
    error: error.message,
  }, null, 2));
  process.exitCode = 1;
} finally {
  if (typeof db.close === "function") await db.close();
}
