/**
 * Create or update the local database (`DATABASE_PATH`, default `data/enzyme.db`). The server
 * and `pnpm seed` also do this, so it is mainly the explicit first step on a fresh clone.
 *
 *   pnpm db:migrate
 */
import { resolve } from "node:path";
import { repoRoot, runMigrations } from "../db/index.js";

runMigrations();
console.log(`database ready: ${resolve(repoRoot, process.env.DATABASE_PATH ?? "data/enzyme.db")}`);
