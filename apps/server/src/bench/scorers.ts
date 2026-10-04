/**
 * The benchmark's Mastra scorers (`@mastra/core/evals`). Each scores one generated card:
 * input is the paper the model was given, output the checked card. The logic lives in the
 * plain functions of `scores.ts`; the scorers add Mastra's step structure and reasons.
 */
import type { StudyCard } from "@enzyme/shared";
import { createScorer, notScorable } from "@mastra/core/evals";
import type { Judge, Judgement } from "./judge.js";
import { faithfulness, quoteCheck, unknownDiscipline } from "./scores.js";

export interface ScoredPaper {
  title: string;
  abstract: string;
}
export interface ScoredCard {
  card: StudyCard;
}

export const quoteCheckScorer = createScorer<ScoredPaper, ScoredCard>({
  id: "quote-check-rate",
  description: "Share of the values the model gave whose quote is found in the title or abstract",
})
  .preprocess(({ run }) => quoteCheck(run.output.card))
  .generateScore(({ results }) => results.preprocessStepResult.rate ?? notScorable("no values"))
  .generateReason(
    ({ results: { preprocessStepResult: q } }) =>
      `${q.stated} of ${q.given} values verified, ${q.suspect} suspect, ${q.unknown} unknown`,
  );

export const unknownDisciplineScorer = createScorer<ScoredPaper, ScoredCard>({
  id: "unknown-discipline",
  description:
    "Share of the rarely-stated fields (comparator, dose, duration, limitations, funding) left unknown or backed by the abstract",
})
  .preprocess(({ run }) => {
    if (!run.input) throw new Error("unknown-discipline needs the paper as input");
    return unknownDiscipline(run.output.card, run.input);
  })
  .generateScore(({ results }) => results.preprocessStepResult.score)
  .generateReason(({ results: { preprocessStepResult: u } }) =>
    u.guessed.length ? `Guessed: ${u.guessed.join(", ")}` : "No guesses",
  );

export interface FaithfulnessAnalysis {
  judgement: Judgement | null;
  claims: number;
  unsupported: string[];
  score: number | null;
  /** Why the judge failed (timeout, unparseable reply…); null when it answered. */
  error: string | null;
}

/**
 * Summary faithfulness, LLM-as-judge. The judge is passed in so the bench can pair each card
 * with a different model than the one that wrote it. A judge failure is recorded, not thrown.
 */
export function createFaithfulnessScorer(judge: Judge) {
  return createScorer<ScoredPaper, ScoredCard>({
    id: "summary-faithfulness",
    description:
      "Share of the claims in takeaway and plainSummary that the verified facts support (LLM judge)",
  })
    .analyze(async ({ run }): Promise<FaithfulnessAnalysis> => {
      try {
        const judgement = await judge({ title: run.input?.title ?? "", card: run.output.card });
        return { judgement, ...faithfulness(judgement.reply), error: null };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return { judgement: null, claims: 0, unsupported: [], score: null, error };
      }
    })
    .generateScore(({ results: { analyzeStepResult: a } }) =>
      a.error ? notScorable(`judge failed: ${a.error}`) : (a.score ?? notScorable("no claims")),
    )
    .generateReason(({ results: { analyzeStepResult: a } }) =>
      a.error || !a.unsupported?.length ? "" : `Unsupported: ${a.unsupported.join(" | ")}`,
    );
}
