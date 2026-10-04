/**
 * Add her starting saved searches (see `db/seed.ts`). Safe to run again: searches that already
 * exist by name or query are skipped. No model key needed.
 *
 *   pnpm seed            create the searches; papers arrive when she presses "Pull papers"
 *   pnpm seed --pull     also pull each search from Europe PMC (up to 500 papers each, ~40 s for all six)
 */
import { parseArgs } from "node:util";
import { db, runMigrations } from "../db/index.js";
import { getSearchRow, latestRun } from "../db/searches.js";
import { seed } from "../db/seed.js";
import { startPull } from "../pull.js";
import { europePmc } from "../sources/europepmc.js";

const { values } = parseArgs({ options: { pull: { type: "boolean", default: false } } });

runMigrations();
const { created, skipped } = seed(db);
for (const s of created) console.log(`  + #${s.id} ${s.name}`);
for (const s of skipped) console.log(`  = #${s.id} ${s.name} (already there)`);
console.log(`${created.length} created, ${skipped.length} already there`);

if (values.pull) {
  for (const { id, name } of [...created, ...skipped]) {
    const search = getSearchRow(db, id);
    if (!search) continue;
    process.stdout.write(`pulling #${id} ${name}… `);
    await startPull({ db, europePmc }, search).done;
    const run = latestRun(db, id);
    if (run?.status === "running") {
      // startPull hands back a run that was already going: the server is pulling it, or an
      // earlier pull was interrupted (the server marks those failed when it next starts).
      console.log("skipped: a pull is already running (restart the server if it was interrupted)");
      continue;
    }
    console.log(
      run?.status === "succeeded"
        ? `${run.fetched} papers (${run.hitCount ?? "?"} hits, ${run.inserted} new to the library)`
        : `failed: ${run?.error ?? "unknown error"}`,
    );
  }
} else if (created.length > 0) {
  console.log('Papers arrive when you press "Pull papers" on a search, or run `pnpm seed --pull`.');
}
