import { initDatabase } from "../db.js";

try {
  await initDatabase();
  console.log("DB_INIT_DONE");
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
