import { z } from "zod";

/**
 * A full-text link as reported by the source, e.g. an open-access PDF on Europe PMC
 * or a DOI link behind a paywall.
 */
export const fullTextUrlSchema = z.object({
  url: z.string(),
  /** Where the link points, e.g. "DOI", "Europe_PMC", "PubMedCentral". */
  site: z.string().nullable(),
  /** "Free", "Open access", "Subscription required", ... */
  availability: z.string().nullable(),
  /** "pdf", "html", "doi", ... */
  documentStyle: z.string().nullable(),
});

export type FullTextUrl = z.infer<typeof fullTextUrlSchema>;

/**
 * A paper as mapped from a source record, before it is stored.
 *
 * Missing or unknown fields are `null`, never guessed: an empty `meshHeadings` list
 * means "the source says none", `null` means "the source didn't say" (e.g. preprints
 * are not MeSH-indexed). `title` and `abstract` may contain inline HTML (`<i>`, `<sub>`,
 * `<h4>` section headings) and must be sanitised before display; use `stripHtml` for
 * search indexing or model input.
 */
export const paperInputSchema = z.object({
  /** Source database code, e.g. Europe PMC "MED" (PubMed), "PPR" (preprint), "PMC", "AGR". */
  source: z.string().min(1),
  /** The record's id within `source`; with `source` this is the only key every record has. */
  sourceId: z.string().min(1),
  pmid: z.string().nullable(),
  pmcid: z.string().nullable(),
  doi: z.string().nullable(),
  title: z.string().nullable(),
  abstract: z.string().nullable(),
  /** Display string as given by the source, e.g. "Sun Y, Li Y, Ren M." */
  authors: z.string().nullable(),
  /** Journal title, or the preprint server (e.g. "bioRxiv") for preprints. */
  journal: z.string().nullable(),
  /** ISO date `YYYY-MM-DD`. */
  firstPublicationDate: z.string().nullable(),
  pubYear: z.number().int().nullable(),
  pubTypes: z.array(z.string()).nullable(),
  meshHeadings: z.array(z.string()).nullable(),
  keywords: z.array(z.string()).nullable(),
  citedByCount: z.number().int().nullable(),
  isOpenAccess: z.boolean().nullable(),
  fullTextUrls: z.array(fullTextUrlSchema).nullable(),
  isPreprint: z.boolean(),
});

export type PaperInput = z.infer<typeof paperInputSchema>;
