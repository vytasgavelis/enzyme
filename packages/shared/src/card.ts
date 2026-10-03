/**
 * Study card (EN-15, EN-16, EN-17): structured facts extracted from a paper's abstract by the
 * model, each backed by a verbatim quote, plus a one-line takeaway and a plain-language summary
 * written from those facts. Shown to the user as "Key facts".
 *
 * `cardOutputSchema` is what the model must return. The server checks every quote against the
 * abstract (`checkCard`) and stores the result as a `StudyCard`.
 */
import { z } from "zod";

export const resultDirections = ["improved", "worsened", "no-difference", "mixed"] as const;
export type ResultDirection = (typeof resultDirections)[number];

export const resultDirectionLabels: Record<ResultDirection, string> = {
  improved: "Improved",
  worsened: "Worsened",
  "no-difference": "No difference",
  mixed: "Mixed results",
};

/** Card fields in display order, with what the model is told each one means. */
export const cardFields = {
  design: {
    label: "Study design",
    hint: "Type of study as the abstract states it, e.g. 'randomised double-blind placebo-controlled trial', 'cohort study', 'mouse study', 'in vitro', 'systematic review and meta-analysis of 12 RCTs'.",
  },
  population: {
    label: "Population",
    hint: "Who or what was studied: people (age, sex, condition), animal species and model, or cell line.",
  },
  sampleSize: {
    label: "Sample size",
    hint: "Number of participants, animals or included studies, with the unit, e.g. '120 adults', '40 mice', '15 RCTs (n = 1,024)'. Only if a number is stated.",
  },
  interventionOrExposure: {
    label: "Intervention / exposure",
    hint: "What was given, done or measured as the exposure, e.g. 'magnesium glycinate', 'BPC-157 injections', 'daily sauna use'. Include the form of a compound if stated.",
  },
  comparator: {
    label: "Compared with",
    hint: "The control or comparison group, e.g. 'placebo', 'no treatment', 'standard care'.",
  },
  doseOrRegimen: {
    label: "Dose / regimen",
    hint: "Amount, frequency and route with units exactly as stated, e.g. '500 mg twice daily, oral'. Unknown unless a dose is written in the abstract.",
  },
  duration: {
    label: "Duration",
    hint: "How long the intervention or follow-up lasted, e.g. '8 weeks'.",
  },
  primaryOutcome: {
    label: "Primary outcome",
    hint: "The main thing measured, e.g. 'sleep latency (PSQI)'.",
  },
  resultDirection: {
    label: "Result",
    hint: `Direction of the main result for the primary outcome versus the comparator. value must be one of: ${resultDirections.join(", ")}.`,
  },
  effectSummary: {
    label: "Effect",
    hint: "The main result with its numbers if given (effect size, p-value, confidence interval).",
  },
  limitations: {
    label: "Limitations",
    hint: "Limitations the abstract itself mentions. Unknown if none are mentioned; do not add your own.",
  },
  fundingOrCoi: {
    label: "Funding / conflicts",
    hint: "Funding source or conflicts of interest. Abstracts rarely state these: unknown unless explicitly written.",
  },
} as const;

export type CardFieldKey = keyof typeof cardFields;
export const cardFieldKeys = Object.keys(cardFields) as CardFieldKey[];

const outputField = (hint: string) =>
  z
    .object({
      quote: z
        .string()
        .nullable()
        .describe(
          "The shortest exact span copied character for character from the abstract that states this fact; null if unknown",
        ),
      value: z.string().nullable().describe("The fact in a few words; null if unknown"),
      status: z
        .enum(["stated", "unknown"])
        .describe("'stated' only if the abstract explicitly says it; otherwise 'unknown'"),
    })
    .describe(hint);

/**
 * What the model returns. The summary fields come last so the model writes them after, and
 * from, the extracted facts.
 */
export const cardOutputSchema = z.object({
  ...(Object.fromEntries(cardFieldKeys.map((k) => [k, outputField(cardFields[k].hint)])) as Record<
    CardFieldKey,
    ReturnType<typeof outputField>
  >),
  takeaway: z
    .string()
    .describe(
      "One plain sentence (max 25 words) on what the study found and in whom, for a non-scientist. Say 'in mice' or 'in cells' when it was not done in people.",
    ),
  plainSummary: z
    .string()
    .describe(
      "Two or three plain sentences for a non-scientist, using only the facts above: what was tested, in whom, what happened, and the main caveat.",
    ),
});

export type CardOutput = z.infer<typeof cardOutputSchema>;

/**
 * - `stated`: the model gave a value and its quote was found in the abstract.
 * - `unknown`: the abstract doesn't say.
 * - `suspect`: the model gave a value, but its quote is missing or not in the abstract.
 */
export type CardFieldStatus = "stated" | "unknown" | "suspect";

export interface CardField {
  value: string | null;
  quote: string | null;
  status: CardFieldStatus;
}

export type StudyCard = Record<CardFieldKey, CardField> & {
  takeaway: string | null;
  plainSummary: string | null;
};

/** A stored card as the API returns it. */
export interface PaperCard {
  paperId: number;
  /** Provider and model, e.g. `google/gemma-4-26b-a4b-it`. */
  modelId: string;
  createdAt: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  card: StudyCard;
}

/** Lowercase, straight quotes, plain hyphens, single spaces: what quote matching compares. */
function normalise(s: string) {
  return s
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A quote's verbatim pieces. The model sometimes joins two sentences with "..." or "[...]";
 * each piece must then be found on its own.
 */
export function quoteParts(quote: string): string[] {
  return quote
    .split(/\s*(?:\[\s*(?:\.\.\.|…)\s*\]|\.\.\.|…)\s*/)
    .map((p) => p.trim().replace(/\.$/, ""))
    .filter((p) => p.length > 0);
}

/**
 * Whether every part of `quote` appears in `text`, ignoring case, whitespace and quote/dash
 * variants. A trailing full stop is ignored, since the model often adds or drops one.
 */
export function quoteInText(text: string, quote: string): boolean {
  const parts = quoteParts(quote).map(normalise);
  const haystack = normalise(text);
  return parts.length > 0 && parts.every((p) => haystack.includes(p));
}

/**
 * Turns model output into a stored card: a field is `stated` only with a value and a quote
 * found in the plain-text title or abstract the model was given, `unknown` when the model
 * said so or gave no value, `suspect` otherwise. A result direction outside
 * `resultDirections` is suspect too.
 */
export function checkCard(
  output: CardOutput,
  source: { title: string; abstract: string },
): StudyCard {
  const inSource = (quote: string) =>
    quoteInText(source.abstract, quote) || quoteInText(source.title, quote);
  const fields = {} as Record<CardFieldKey, CardField>;
  for (const key of cardFieldKeys) {
    const f = output[key];
    let value = f.value?.trim() || null;
    const quote = f.quote?.trim() || null;
    if (f.status === "unknown" || value === null) {
      fields[key] = { value: null, quote: null, status: "unknown" };
      continue;
    }
    if (key === "resultDirection") value = value.toLowerCase();
    const verified =
      quote !== null &&
      inSource(quote) &&
      (key !== "resultDirection" || resultDirections.includes(value as ResultDirection));
    fields[key] = { value, quote, status: verified ? "stated" : "suspect" };
  }
  return {
    ...fields,
    takeaway: output.takeaway.trim() || null,
    plainSummary: output.plainSummary.trim() || null,
  };
}

/** The card's result direction when it is stated and verified, for the feed badge. */
export function cardResultDirection(card: StudyCard): ResultDirection | null {
  const f = card.resultDirection;
  return f.status === "stated" ? (f.value as ResultDirection) : null;
}
