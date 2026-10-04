import { cardFields, type StudyCard } from "@enzyme/shared";
import { Agent } from "@mastra/core/agent";
import { type JudgeReply, parseJudgeReply, verifiedFacts } from "./scores.js";

const TIMEOUT_MS = 90_000;

export interface Judgement {
  reply: JudgeReply;
  judgeModel: string;
  latencyMs: number;
}

/** Asks a model which claims in a card's takeaway and summary its verified facts support. */
export type Judge = (input: { title: string; card: StudyCard }) => Promise<Judgement>;

const INSTRUCTIONS = `You check summaries of scientific papers for unsupported claims.

You get the paper's title, a list of facts extracted from its abstract, a one-line takeaway and a short plain-language summary.
Split the takeaway and the summary into their individual factual claims. For each claim decide whether the title and the listed facts support it.
- A claim is supported if it restates, simplifies or combines the facts without adding anything.
- A claim is unsupported if it adds a number, population, dose, duration, effect, mechanism, recommendation or caveat that is not in the facts or title, or overstates them (e.g. "cures" for "reduced", people when the facts say mice).
- Generic framing ("this study looked at") is not a claim.

Reply with only a JSON object, no code fences, in exactly this shape:
{"claims": [{"claim": "...", "supported": true}]}`;

export function judgePrompt(title: string, card: StudyCard): string {
  const facts = verifiedFacts(card)
    .map((f) => `- ${cardFields[f.key].label}: ${f.value}`)
    .join("\n");
  return `Title: ${title}

Facts:
${facts || "(none)"}

Takeaway: ${card.takeaway ?? ""}

Summary: ${card.plainSummary ?? ""}`;
}

/** A Gemma (or any router model) judge, with the same Gemma settings as the card agent. */
export function createJudge(modelId: string): Judge {
  const agent = new Agent({
    id: "summary-judge",
    name: "Summary faithfulness judge",
    instructions: INSTRUCTIONS,
    model: modelId,
  });
  return async ({ title, card }) => {
    const started = Date.now();
    const abortSignal = AbortSignal.timeout(TIMEOUT_MS);
    const res = await agent.generate(judgePrompt(title, card), {
      modelSettings: { temperature: 0.2 },
      providerOptions: { google: { thinkingConfig: { thinkingLevel: "minimal" } } },
      abortSignal,
    });
    // Mastra resolves an aborted call with empty text rather than throwing.
    if (abortSignal.aborted) throw new Error(`Judge timed out after ${TIMEOUT_MS / 1000} s`);
    return {
      reply: parseJudgeReply(res.text),
      judgeModel: modelId,
      latencyMs: Date.now() - started,
    };
  };
}
