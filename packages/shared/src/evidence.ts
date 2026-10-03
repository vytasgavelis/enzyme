/**
 * Metadata-only classification of a paper (EN-21, EN-9, EN-18): evidence tier from publication
 * types, species from MeSH, retraction from publication types. No model involved.
 */

/** Strongest first; the order is also the sort order for "Sort: evidence tier". */
export const tiers = [
  "meta-analysis",
  "systematic-review",
  "rct",
  "clinical-trial",
  "observational",
  "review",
  "case-report",
  "other",
] as const;

export type Tier = (typeof tiers)[number];

export const tierLabels: Record<Tier, string> = {
  "meta-analysis": "Meta-analysis",
  "systematic-review": "Systematic review",
  rct: "RCT",
  "clinical-trial": "Clinical trial",
  observational: "Observational",
  review: "Review",
  "case-report": "Case report",
  other: "Other",
};

/**
 * Europe PMC mixes MEDLINE publication types ("Systematic Review") with JATS article types
 * ("systematic-review"), so match on a lowercased, de-hyphenated form.
 */
const tierPatterns: [Tier, RegExp][] = [
  ["meta-analysis", /^meta analysis$/],
  ["systematic-review", /^systematic review$/],
  ["rct", /^randomized controlled trial$/],
  ["clinical-trial", /^(controlled )?clinical trial( phase [ivx]+)?$|^clinical trial protocol$/],
  ["observational", /^observational study$|^comparative study$|^multicenter study$/],
  ["review", /^review( article)?$|^scoping review$|^narrative review$/],
  ["case-report", /^case reports?$|^case study$/],
];

const normalise = (t: string) => t.toLowerCase().replace(/[-,]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Titles usually name the design ("…: a randomised, double-blind, placebo-controlled trial").
 * Used only when the publication types say nothing, which is the case for most papers from
 * the last few months (MEDLINE hasn't indexed them yet; Europe PMC gives only "research-article").
 */
const titlePatterns: [Tier, RegExp][] = [
  ["meta-analysis", /meta-?analy[sz]/i],
  ["systematic-review", /systematic (literature )?review/i],
  ["rct", /randomi[sz]ed\b.*\b(trial|study)|\bRCT\b/i],
  [
    "clinical-trial",
    /\b(clinical|pilot|open-label|crossover|controlled) (trial|study)\b|\btrial\b/i,
  ],
  ["observational", /\b(cohort|cross-sectional|case-control|observational)\b/i],
  ["review", /\breview\b/i],
  ["case-report", /\bcase (report|series)\b/i],
];

/**
 * The strongest tier any of the paper's publication types maps to; failing that, a guess from
 * the title (`fromTitle: true`, so the UI can say it's a guess).
 */
export function deriveTier(
  pubTypes: readonly string[] | null,
  title: string | null = null,
): { tier: Tier; fromTitle: boolean } {
  const types = (pubTypes ?? []).map(normalise);
  for (const [tier, pattern] of tierPatterns) {
    if (types.some((t) => pattern.test(t))) return { tier, fromTitle: false };
  }
  if (title) {
    for (const [tier, pattern] of titlePatterns) {
      if (pattern.test(title)) return { tier, fromTitle: true };
    }
  }
  return { tier: "other", fromTitle: false };
}

/**
 * `unknown` when there is no MeSH: preprints and recent papers that MEDLINE hasn't indexed yet
 * (about half of a typical pull).
 */
export type Species = "human" | "animal" | "unknown";

export function deriveSpecies(meshHeadings: readonly string[] | null): Species {
  if (!meshHeadings || meshHeadings.length === 0) return "unknown";
  if (meshHeadings.includes("Humans")) return "human";
  if (meshHeadings.includes("Animals")) return "animal";
  return "unknown";
}

export function isRetracted(pubTypes: readonly string[] | null): boolean {
  return (pubTypes ?? []).some((t) => /^retracted publication$/i.test(t));
}
