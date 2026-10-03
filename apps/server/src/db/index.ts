import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, migrateDb } from "./client.js";
import * as schema from "./schema.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** The app database. Tests should use `createDb(":memory:")` from `./client.js` instead. */
export const db = createDb(resolve(repoRoot, process.env.DATABASE_PATH ?? "data/enzyme.db"));

/** Apply pending migrations to the app database. Called once at startup. */
export function runMigrations() {
  migrateDb(db);
}

export type { Db } from "./client.js";
export { schema };
