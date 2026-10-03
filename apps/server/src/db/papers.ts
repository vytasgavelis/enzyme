import { type PaperInput, stripHtml } from "@enzyme/shared";
import { and, eq, type SQL } from "drizzle-orm";
import type { Db } from "./client.js";
import { type NewPaper, type Paper, papers } from "./schema.js";

export interface UpsertResult {
  id: number;
  /** `false` when the record was merged into an existing row. */
  inserted: boolean;
}

/** Lowercases and drops any `doi:` / `https://doi.org/` prefix; blank becomes `null`. */
export function normaliseDoi(doi: string | null): string | null {
  const bare = doi
    ?.trim()
    .toLowerCase()
    .replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/, "");
  return bare || null;
}

/** Columns that a later record may update. Identifiers are handled separately. */
type MergeableColumn = Exclude<
  keyof NewPaper,
  "id" | "source" | "sourceId" | "pmid" | "pmcid" | "doi" | "raw" | "firstSeenAt" | "updatedAt"
>;

function mergeableColumns(paper: PaperInput): Pick<NewPaper, MergeableColumn> {
  return {
    title: paper.title,
    abstract: paper.abstract,
    titleText: paper.title === null ? null : stripHtml(paper.title),
    abstractText: paper.abstract === null ? null : stripHtml(paper.abstract),
    authors: paper.authors,
    journal: paper.journal,
    pubDate: paper.firstPublicationDate,
    pubYear: paper.pubYear,
    pubTypes: paper.pubTypes,
    meshHeadings: paper.meshHeadings,
    keywords: paper.keywords,
    citedByCount: paper.citedByCount,
    isOpenAccess: paper.isOpenAccess,
    isPreprint: paper.isPreprint,
    fullTextUrls: paper.fullTextUrls,
  };
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Stores a source record, merging it into an existing paper when one matches by PMID,
 * then normalised DOI, then (source, sourceId).
 *
 * On a merge, non-null incoming values replace stored ones and `null` (unknown) never
 * erases a known value. Identifiers (pmid, pmcid, doi) are only filled in, never changed,
 * and a DOI already owned by another row is left off. `source`/`sourceId` keep the first
 * record's values; `raw` is the latest record. Only changed columns are written, so the
 * FTS triggers fire only when the text changes.
 */
export function upsertPaper(db: Db, paper: PaperInput, raw: unknown): UpsertResult {
  const doi = normaliseDoi(paper.doi);

  return db.transaction((tx) => {
    const find = (where: SQL | undefined): Paper | undefined =>
      tx.select().from(papers).where(where).get();
    const byPmid = paper.pmid ? find(eq(papers.pmid, paper.pmid)) : undefined;
    const byDoi = doi ? find(eq(papers.doi, doi)) : undefined;
    const bySource = find(
      and(eq(papers.source, paper.source), eq(papers.sourceId, paper.sourceId)),
    );
    const existing = byPmid ?? byDoi ?? bySource;

    const columns = mergeableColumns(paper);

    if (!existing) {
      const row = tx
        .insert(papers)
        .values({
          ...columns,
          source: paper.source,
          sourceId: paper.sourceId,
          pmid: paper.pmid,
          pmcid: paper.pmcid,
          doi,
          raw,
        })
        .returning({ id: papers.id })
        .get();
      return { id: row.id, inserted: true };
    }

    const patch: Partial<NewPaper> = { raw, updatedAt: new Date() };
    for (const [key, value] of Object.entries(columns) as [MergeableColumn, unknown][]) {
      if (value !== null && !sameValue(value, existing[key])) {
        (patch as Record<string, unknown>)[key] = value;
      }
    }
    if (existing.pmid === null && paper.pmid) patch.pmid = paper.pmid;
    if (existing.pmcid === null && paper.pmcid) patch.pmcid = paper.pmcid;
    if (existing.doi === null && doi && !byDoi) patch.doi = doi;

    tx.update(papers).set(patch).where(eq(papers.id, existing.id)).run();
    return { id: existing.id, inserted: false };
  });
}
