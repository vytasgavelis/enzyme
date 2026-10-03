import type { FullTextUrl, StudyCard } from "@enzyme/shared";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** Milliseconds since epoch, so "new since last viewed" can compare within the same second. */
const nowMs = sql`(cast(unixepoch('subsec') * 1000 as integer))`;
const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

/** A saved Europe PMC query the user pulls papers for (EN-1). */
export const savedSearches = sqliteTable("saved_searches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  query: text("query").notNull(),
  createdAt: timestamp("created_at").notNull().default(nowMs),
  lastRunAt: timestamp("last_run_at"),
  lastViewedAt: timestamp("last_viewed_at"),
});

/**
 * One row per paper, merged across sources (see `upsertPaper`). Nullable columns follow
 * `PaperInput`: `null` means the source didn't say.
 *
 * `title`/`abstract` keep the source HTML; `title_text`/`abstract_text` are the
 * `stripHtml` copies that the FTS5 table `papers_fts` indexes. The FTS table and its
 * triggers live in a hand-written migration because Drizzle does not model virtual tables.
 */
export const papers = sqliteTable(
  "papers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Source and id of the record that first created this row. */
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    pmid: text("pmid"),
    pmcid: text("pmcid"),
    /** Normalised: lowercase, no `https://doi.org/` prefix. */
    doi: text("doi"),
    title: text("title"),
    abstract: text("abstract"),
    titleText: text("title_text"),
    abstractText: text("abstract_text"),
    authors: text("authors"),
    journal: text("journal"),
    /** ISO date `YYYY-MM-DD`. */
    pubDate: text("pub_date"),
    pubYear: integer("pub_year"),
    pubTypes: text("pub_types", { mode: "json" }).$type<string[]>(),
    meshHeadings: text("mesh_headings", { mode: "json" }).$type<string[]>(),
    keywords: text("keywords", { mode: "json" }).$type<string[]>(),
    citedByCount: integer("cited_by_count"),
    isOpenAccess: integer("is_open_access", { mode: "boolean" }),
    isPreprint: integer("is_preprint", { mode: "boolean" }).notNull(),
    fullTextUrls: text("full_text_urls", { mode: "json" }).$type<FullTextUrl[]>(),
    /** The last source record merged into this row, kept so re-mapping needs no refetch. */
    raw: text("raw", { mode: "json" }).notNull(),
    firstSeenAt: timestamp("first_seen_at").notNull().default(nowMs),
    updatedAt: timestamp("updated_at").notNull().default(nowMs),
  },
  (t) => [
    uniqueIndex("papers_source_uq").on(t.source, t.sourceId),
    uniqueIndex("papers_pmid_uq").on(t.pmid),
    uniqueIndex("papers_doi_uq").on(t.doi),
    index("papers_pub_date_idx").on(t.pubDate),
  ],
);

/** Which saved search matched which paper, and when it first did (EN-19). */
export const searchPapers = sqliteTable(
  "search_papers",
  {
    searchId: integer("search_id")
      .notNull()
      .references(() => savedSearches.id, { onDelete: "cascade" }),
    paperId: integer("paper_id")
      .notNull()
      .references(() => papers.id, { onDelete: "cascade" }),
    firstMatchedAt: timestamp("first_matched_at").notNull().default(nowMs),
  },
  (t) => [
    primaryKey({ columns: [t.searchId, t.paperId] }),
    index("search_papers_paper_idx").on(t.paperId),
  ],
);

export const pullRunStatuses = ["running", "succeeded", "failed"] as const;
export type PullRunStatus = (typeof pullRunStatuses)[number];

/** One pull of a saved search; counters are updated while it runs (EN-22). */
export const pullRuns = sqliteTable(
  "pull_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    searchId: integer("search_id")
      .notNull()
      .references(() => savedSearches.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at").notNull().default(nowMs),
    finishedAt: timestamp("finished_at"),
    /** Europe PMC `hitCount` for the query, once the first page is in. */
    hitCount: integer("hit_count"),
    fetched: integer("fetched").notNull().default(0),
    /** Papers not in the database at all before this pull. */
    inserted: integer("inserted").notNull().default(0),
    /** Papers newly linked to this search, including ones another search already stored. */
    newMatches: integer("new_matches").notNull().default(0),
    status: text("status", { enum: pullRunStatuses }).notNull().default("running"),
    error: text("error"),
  },
  (t) => [index("pull_runs_search_idx").on(t.searchId, t.startedAt)],
);

/**
 * Generated study cards (T-7). Regenerating adds a row; the newest per paper is the current
 * card, and older rows stay as raw data for the model benchmark (EN-38).
 */
export const cards = sqliteTable(
  "cards",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    paperId: integer("paper_id")
      .notNull()
      .references(() => papers.id, { onDelete: "cascade" }),
    /** Provider and model, e.g. `google/gemma-4-26b-a4b-it`. */
    modelId: text("model_id").notNull(),
    /** The checked card (`checkCard`), quotes verified against the abstract. */
    card: text("card", { mode: "json" }).$type<StudyCard>().notNull(),
    latencyMs: integer("latency_ms").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: timestamp("created_at").notNull().default(nowMs),
  },
  (t) => [index("cards_paper_idx").on(t.paperId, t.createdAt)],
);

export type SavedSearch = typeof savedSearches.$inferSelect;
export type Paper = typeof papers.$inferSelect;
export type NewPaper = typeof papers.$inferInsert;
export type SearchPaper = typeof searchPapers.$inferSelect;
export type PullRun = typeof pullRuns.$inferSelect;
export type CardRow = typeof cards.$inferSelect;
