import { PULL_CAP, type PullRun, type SavedSearch } from "@enzyme/shared";
import { and, count, desc, eq, gt } from "drizzle-orm";
import type { Db } from "./client.js";
import { pullRuns, savedSearches, searchPapers } from "./schema.js";

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toPullRun(row: typeof pullRuns.$inferSelect): PullRun {
  return {
    id: row.id,
    searchId: row.searchId,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finishedAt: iso(row.finishedAt),
    hitCount: row.hitCount,
    target: row.hitCount === null ? null : Math.min(row.hitCount, PULL_CAP),
    fetched: row.fetched,
    inserted: row.inserted,
    newMatches: row.newMatches,
    error: row.error,
  };
}

export function latestRun(db: Db, searchId: number): PullRun | null {
  const row = db
    .select()
    .from(pullRuns)
    .where(eq(pullRuns.searchId, searchId))
    .orderBy(desc(pullRuns.startedAt), desc(pullRuns.id))
    .limit(1)
    .get();
  return row ? toPullRun(row) : null;
}

export function runningRun(db: Db, searchId: number): PullRun | null {
  const row = db
    .select()
    .from(pullRuns)
    .where(and(eq(pullRuns.searchId, searchId), eq(pullRuns.status, "running")))
    .get();
  return row ? toPullRun(row) : null;
}

function toSavedSearch(db: Db, row: typeof savedSearches.$inferSelect): SavedSearch {
  const links = eq(searchPapers.searchId, row.id);
  const paperCount = db.select({ n: count() }).from(searchPapers).where(links).get()?.n ?? 0;
  const newCount = row.lastViewedAt
    ? (db
        .select({ n: count() })
        .from(searchPapers)
        .where(and(links, gt(searchPapers.firstMatchedAt, row.lastViewedAt)))
        .get()?.n ?? 0)
    : 0;
  return {
    id: row.id,
    name: row.name,
    query: row.query,
    intent: row.intent,
    createdAt: row.createdAt.toISOString(),
    lastRunAt: iso(row.lastRunAt),
    lastViewedAt: iso(row.lastViewedAt),
    paperCount,
    newCount,
    lastRun: latestRun(db, row.id),
  };
}

export function listSearches(db: Db): SavedSearch[] {
  return db
    .select()
    .from(savedSearches)
    .orderBy(savedSearches.id)
    .all()
    .map((row) => toSavedSearch(db, row));
}

export function getSearch(db: Db, id: number): SavedSearch | null {
  const row = db.select().from(savedSearches).where(eq(savedSearches.id, id)).get();
  return row ? toSavedSearch(db, row) : null;
}

export function getSearchRow(db: Db, id: number) {
  return db.select().from(savedSearches).where(eq(savedSearches.id, id)).get() ?? null;
}

export interface SearchFields {
  name: string;
  query: string;
  intent: string | null;
}

export function createSearch(db: Db, fields: SearchFields): SavedSearch {
  const row = db.insert(savedSearches).values(fields).returning().get();
  return toSavedSearch(db, row);
}

/** Changing the query keeps the papers the old query matched; the UI re-pulls. */
export function updateSearch(db: Db, id: number, fields: SearchFields): SavedSearch | null {
  const row = db
    .update(savedSearches)
    .set(fields)
    .where(eq(savedSearches.id, id))
    .returning()
    .get();
  return row ? toSavedSearch(db, row) : null;
}

/** Links and runs go with it (FK cascade); papers stay, other searches may share them. */
export function deleteSearch(db: Db, id: number): boolean {
  return db.delete(savedSearches).where(eq(savedSearches.id, id)).run().changes > 0;
}

/** Sets `lastViewedAt` to now and returns the previous value, the cut-off for "new" markers. */
export function markViewed(db: Db, id: number): { previousViewedAt: string | null } | null {
  const row = getSearchRow(db, id);
  if (!row) return null;
  db.update(savedSearches).set({ lastViewedAt: new Date() }).where(eq(savedSearches.id, id)).run();
  return { previousViewedAt: iso(row.lastViewedAt) };
}

/** A pull can't survive a restart: finish any left `running` as failed. Called at startup. */
export function failInterruptedRuns(db: Db): number {
  return db
    .update(pullRuns)
    .set({
      status: "failed",
      finishedAt: new Date(),
      error: "Interrupted (server restarted)",
    })
    .where(eq(pullRuns.status, "running"))
    .run().changes;
}
