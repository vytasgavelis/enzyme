import { PULL_CAP, type PullRun } from "@enzyme/shared";
import { eq } from "drizzle-orm";
import type { Db } from "./db/client.js";
import { upsertPaper } from "./db/papers.js";
import { pullRuns, savedSearches, searchPapers } from "./db/schema.js";
import { runningRun, toPullRun } from "./db/searches.js";
import type { EuropePmcClient } from "./sources/europepmc.js";

export interface PullDeps {
  db: Db;
  europePmc: Pick<EuropePmcClient, "searchAll">;
}

/**
 * Starts pulling a saved search from Europe PMC in the background and returns the new run
 * (or the one already running). The run row is updated as records arrive, so the UI can
 * poll it for progress (EN-22). `done` settles when the pull finishes; requests don't wait
 * for it, tests do.
 *
 * Plain in-process async for now; this is where a Temporal workflow (EN-26) would slot in.
 */
export function startPull(
  deps: PullDeps,
  search: { id: number; query: string },
): { run: PullRun; done: Promise<void> } {
  const { db } = deps;
  // better-sqlite3 is synchronous, so check-then-insert can't race within this process.
  const running = runningRun(db, search.id);
  if (running) return { run: running, done: Promise.resolve() };

  const row = db.insert(pullRuns).values({ searchId: search.id }).returning().get();
  const done = runPull(deps, row.id, search).catch((err: unknown) => {
    db.update(pullRuns)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      })
      .where(eq(pullRuns.id, row.id))
      .run();
  });
  return { run: toPullRun(row), done };
}

async function runPull(deps: PullDeps, runId: number, search: { id: number; query: string }) {
  const { db, europePmc } = deps;
  const progress = { fetched: 0, inserted: 0, newMatches: 0 };
  const saveProgress = (extra: Partial<typeof pullRuns.$inferInsert> = {}) =>
    db
      .update(pullRuns)
      .set({ ...progress, ...extra })
      .where(eq(pullRuns.id, runId))
      .run();

  const records = europePmc.searchAll(search.query, {
    maxRecords: PULL_CAP,
    onPage: ({ hitCount }) => saveProgress({ hitCount }),
  });

  for await (const { paper, raw } of records) {
    const { id: paperId, inserted } = upsertPaper(db, paper, raw);
    const linked = db
      .insert(searchPapers)
      .values({ searchId: search.id, paperId })
      .onConflictDoNothing()
      .run();
    progress.fetched++;
    if (inserted) progress.inserted++;
    if (linked.changes > 0) progress.newMatches++;
    // Cheap with SQLite, and keeps the progress bar moving record by record.
    saveProgress();
  }

  const finishedAt = new Date();
  db.transaction((tx) => {
    tx.update(pullRuns)
      .set({ ...progress, status: "succeeded", finishedAt })
      .where(eq(pullRuns.id, runId))
      .run();
    tx.update(savedSearches)
      .set({ lastRunAt: finishedAt })
      .where(eq(savedSearches.id, search.id))
      .run();
  });
}
