/**
 * HTTP contract between the web UI and the API for saved searches, pulls and the feed
 * (T-4, T-5, T-6). Implemented by `apps/server/src/routes/searches.ts`, and in the browser by
 * the mock in `apps/web/src/lib/mock-api.ts` (`VITE_MOCK_API=1`).
 *
 * Timestamps are ISO 8601 strings on the wire.
 */
import { z } from "zod";
import type { PaperCard } from "./card.js";
import type { Species, Tier } from "./evidence.js";
import { tiers } from "./evidence.js";
import type { FullTextUrl } from "./paper.js";

// ---------------------------------------------------------------------------------------------
// Saved searches (EN-1)

/**
 * `query` is Europe PMC syntax. When left empty the name is used as the query, so "magnesium
 * sleep" works without knowing the syntax.
 */
export const savedSearchInputSchema = z.object({
  name: z.string().trim().min(1, "Give the search a name").max(80),
  query: z.string().trim().max(2000).default(""),
});

export type SavedSearchInput = z.input<typeof savedSearchInputSchema>;

export interface SavedSearch {
  id: number;
  name: string;
  /** The query actually sent to Europe PMC (the name when the user left it empty). */
  query: string;
  createdAt: string;
  lastRunAt: string | null;
  lastViewedAt: string | null;
  paperCount: number;
  /** Papers first matched after `lastViewedAt` (EN-19). */
  newCount: number;
  /** The most recent pull, so the sidebar can show progress without a second request. */
  lastRun: PullRun | null;
}

// ---------------------------------------------------------------------------------------------
// Pulls (EN-3, EN-22)

/** Upper bound on records fetched per pull. */
export const PULL_CAP = 500;

export type PullRunStatus = "running" | "succeeded" | "failed";

export interface PullRun {
  id: number;
  searchId: number;
  status: PullRunStatus;
  startedAt: string;
  finishedAt: string | null;
  /** Europe PMC's total hits for the query; known after the first page. */
  hitCount: number | null;
  /** min(hitCount, PULL_CAP): what "done" means for the progress bar. */
  target: number | null;
  fetched: number;
  /** Papers that were not in the database at all before this pull. */
  inserted: number;
  /** Papers newly linked to this search (includes ones another search already stored). */
  newMatches: number;
  error: string | null;
}

// ---------------------------------------------------------------------------------------------
// Feed (EN-9, EN-19, EN-21)

export const feedSorts = ["newest", "tier", "cited"] as const;
export type FeedSort = (typeof feedSorts)[number];

/**
 * - `any`: everything
 * - `no-animal`: hide papers MeSH marks as animal-only (keeps unknown)
 * - `human`: only papers MeSH marks as human (drops unknown, i.e. most recent papers)
 */
export const speciesFilters = ["any", "no-animal", "human"] as const;
export type SpeciesFilter = (typeof speciesFilters)[number];

export const preprintFilters = ["include", "exclude", "only"] as const;
export type PreprintFilter = (typeof preprintFilters)[number];

const flag = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((v) => v === true || v === "true");

export const feedQuerySchema = z.object({
  /** Full-text search over title and abstract (FTS5). */
  q: z.string().trim().max(200).default(""),
  /**
   * Only papers whose evidence tier is in this list; empty means all. Sent as a repeated query
   * param (`tiers=rct&tiers=review`), which arrives as a plain string when there is only one.
   */
  tiers: z.union([z.enum(tiers).transform((t) => [t]), z.array(z.enum(tiers))]).default([]),
  /** Publication date lower bound, `YYYY-MM-DD`. */
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  species: z.enum(speciesFilters).default("any"),
  preprints: z.enum(preprintFilters).default("include"),
  openAccessOnly: flag.default(false),
  hideRetracted: flag.default(true),
  newOnly: flag.default(false),
  /**
   * Papers first matched after this instant are flagged `isNew`. The UI passes the
   * `lastViewedAt` it saw before opening the feed, so markers survive the visit.
   */
  newSince: z.iso.datetime().optional(),
  sort: z.enum(feedSorts).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type FeedQuery = z.input<typeof feedQuerySchema>;
export type FeedQueryParsed = z.output<typeof feedQuerySchema>;

export interface FeedPaper {
  id: number;
  source: string;
  sourceId: string;
  pmid: string | null;
  pmcid: string | null;
  doi: string | null;
  /** May contain inline HTML; sanitise before display. */
  title: string | null;
  /** May contain inline HTML (`<h4>` section headings etc.); sanitise before display. */
  abstract: string | null;
  authors: string | null;
  journal: string | null;
  pubDate: string | null;
  pubYear: number | null;
  pubTypes: string[] | null;
  meshHeadings: string[] | null;
  keywords: string[] | null;
  citedByCount: number | null;
  isOpenAccess: boolean | null;
  isPreprint: boolean;
  fullTextUrls: FullTextUrl[] | null;
  tier: Tier;
  /** The tier was guessed from the title because the publication types said nothing. */
  tierFromTitle: boolean;
  species: Species;
  isRetracted: boolean;
  firstMatchedAt: string;
  isNew: boolean;
  /** The latest study card, or `null` until one is generated (T-7). */
  card: PaperCard | null;
}

export interface FeedPage {
  items: FeedPaper[];
  /** Papers matching the filters. */
  total: number;
  /** All papers in the search, ignoring filters. */
  searchTotal: number;
  /** Papers in the search (ignoring filters) that are new since `newSince`. */
  newCount: number;
  page: number;
  pageSize: number;
}
