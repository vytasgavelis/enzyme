import {
  deriveSpecies,
  deriveTier,
  type FeedPage,
  type FeedPaper,
  type FeedQueryParsed,
  isRetracted,
  type Species,
  type Tier,
  tiers,
} from "@enzyme/shared";
import { and, count, eq, gt, gte, inArray, type SQL, sql } from "drizzle-orm";
import { latestCards } from "./cards.js";
import type { Db } from "./client.js";
import { papers, searchPapers } from "./schema.js";

/**
 * Turns free text into an FTS5 query: every word must appear, as a prefix ("magnes" finds
 * magnesium). Quoting each word keeps FTS5 syntax characters in user input harmless.
 * `null` when there are no words to search for.
 */
export function ftsQuery(q: string): string | null {
  const words = q.match(/[\p{L}\p{N}]+/gu);
  return words ? words.map((w) => `"${w}"*`).join(" ") : null;
}

interface Candidate {
  id: number;
  firstMatchedAt: Date;
  pubDate: string | null;
  citedByCount: number | null;
  tier: Tier;
  tierFromTitle: boolean;
  species: Species;
  isRetracted: boolean;
}

const tierRank = (t: Tier) => tiers.indexOf(t);
const byDate = (a: Candidate, b: Candidate) =>
  (b.pubDate ?? "").localeCompare(a.pubDate ?? "") || b.id - a.id;
const sorters: Record<FeedQueryParsed["sort"], (a: Candidate, b: Candidate) => number> = {
  newest: byDate,
  tier: (a, b) => tierRank(a.tier) - tierRank(b.tier) || byDate(a, b),
  cited: (a, b) => (b.citedByCount ?? -1) - (a.citedByCount ?? -1) || byDate(a, b),
};

/**
 * One page of a saved search's papers (EN-9, EN-19, EN-21).
 *
 * Column filters and full-text search run in SQL over small columns. Tier, species and
 * retraction are derived from JSON metadata, so they are computed in JS on the survivors,
 * which also do the sorting. Only the page's rows are then loaded in full (abstracts etc.).
 */
export function getFeed(db: Db, searchId: number, f: FeedQueryParsed): FeedPage {
  const newSince = f.newSince ? new Date(f.newSince) : null;
  const inSearch = eq(searchPapers.searchId, searchId);

  const where: (SQL | undefined)[] = [inSearch];
  const match = ftsQuery(f.q);
  if (match) {
    where.push(sql`${papers.id} IN (SELECT rowid FROM papers_fts WHERE papers_fts MATCH ${match})`);
  }
  if (f.from) where.push(gte(papers.pubDate, f.from));
  if (f.preprints === "exclude") where.push(eq(papers.isPreprint, false));
  if (f.preprints === "only") where.push(eq(papers.isPreprint, true));
  if (f.openAccessOnly) where.push(eq(papers.isOpenAccess, true));
  if (f.newOnly) {
    // Without a cut-off nothing is new, as in the `isNew` flag below.
    where.push(newSince ? gt(searchPapers.firstMatchedAt, newSince) : sql`0`);
  }

  const rows = db
    .select({
      id: papers.id,
      firstMatchedAt: searchPapers.firstMatchedAt,
      pubDate: papers.pubDate,
      citedByCount: papers.citedByCount,
      pubTypes: papers.pubTypes,
      titleText: papers.titleText,
      meshHeadings: papers.meshHeadings,
    })
    .from(searchPapers)
    .innerJoin(papers, eq(papers.id, searchPapers.paperId))
    .where(and(...where))
    .all();

  const candidates: Candidate[] = [];
  for (const r of rows) {
    const { tier, fromTitle } = deriveTier(r.pubTypes, r.titleText);
    const c: Candidate = {
      id: r.id,
      firstMatchedAt: r.firstMatchedAt,
      pubDate: r.pubDate,
      citedByCount: r.citedByCount,
      tier,
      tierFromTitle: fromTitle,
      species: deriveSpecies(r.meshHeadings),
      isRetracted: isRetracted(r.pubTypes),
    };
    if (f.tiers.length > 0 && !f.tiers.includes(c.tier)) continue;
    if (f.species === "no-animal" && c.species === "animal") continue;
    if (f.species === "human" && c.species !== "human") continue;
    if (f.hideRetracted && c.isRetracted) continue;
    candidates.push(c);
  }
  candidates.sort(sorters[f.sort]);

  const start = (f.page - 1) * f.pageSize;
  const pageItems = candidates.slice(start, start + f.pageSize);
  const full = pageItems.length
    ? db
        .select()
        .from(papers)
        .where(
          inArray(
            papers.id,
            pageItems.map((c) => c.id),
          ),
        )
        .all()
    : [];
  const byId = new Map(full.map((p) => [p.id, p]));
  const cardsById = latestCards(
    db,
    pageItems.map((c) => c.id),
  );

  const items: FeedPaper[] = pageItems.flatMap((c) => {
    const p = byId.get(c.id);
    if (!p) return [];
    return {
      id: p.id,
      source: p.source,
      sourceId: p.sourceId,
      pmid: p.pmid,
      pmcid: p.pmcid,
      doi: p.doi,
      title: p.title,
      abstract: p.abstract,
      authors: p.authors,
      journal: p.journal,
      pubDate: p.pubDate,
      pubYear: p.pubYear,
      pubTypes: p.pubTypes,
      meshHeadings: p.meshHeadings,
      keywords: p.keywords,
      citedByCount: p.citedByCount,
      isOpenAccess: p.isOpenAccess,
      isPreprint: p.isPreprint,
      fullTextUrls: p.fullTextUrls,
      tier: c.tier,
      tierFromTitle: c.tierFromTitle,
      species: c.species,
      isRetracted: c.isRetracted,
      firstMatchedAt: c.firstMatchedAt.toISOString(),
      isNew: newSince !== null && c.firstMatchedAt > newSince,
      card: cardsById.get(p.id) ?? null,
    };
  });

  const totals = db
    .select({
      searchTotal: count(),
      newCount: newSince
        ? sql<number>`coalesce(sum(${searchPapers.firstMatchedAt} > ${newSince.getTime()}), 0)`
        : sql<number>`0`,
    })
    .from(searchPapers)
    .where(inSearch)
    .get();

  return {
    items,
    total: candidates.length,
    searchTotal: totals?.searchTotal ?? 0,
    newCount: Number(totals?.newCount ?? 0),
    page: f.page,
    pageSize: f.pageSize,
  };
}
