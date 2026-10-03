import { type CardOutput, cardFieldKeys, cardFields, cardOutputSchema } from "@enzyme/shared";
import { Agent } from "@mastra/core/agent";

/** Open-weight default (EN-39); override with `ENZYME_MODEL`, e.g. `google/gemma-4-31b-it`. */
export const DEFAULT_MODEL = "google/gemma-4-26b-a4b-it";

/** A card call that runs longer than this is aborted (it has looped). */
const TIMEOUT_MS = 90_000;

export interface CardGeneration {
  output: CardOutput;
  modelId: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** Generates a card from a paper's plain-text title and abstract. Tests pass a fake. */
export type GenerateCard = (paper: { title: string; abstract: string }) => Promise<CardGeneration>;

/** A model call that failed, with the HTTP status the API should answer with. */
export class ModelError extends Error {
  constructor(
    message: string,
    readonly status: 429 | 502 | 503,
  ) {
    super(message);
  }
}

const INSTRUCTIONS = `You extract facts from the abstract of a scientific paper for a reader who is not a scientist.

Rules:
- Use only the title and abstract you are given. Never use outside knowledge and never guess.
- For each fact, copy the shortest exact span of the abstract that states it into "quote", character for character (no paraphrase, no "..."), then give the fact in a few words as "value", and set status "stated".
- If the abstract does not explicitly state a fact, set status "unknown" with value and quote null. Abstracts often leave out the dose, duration, comparator, limitations and funding: those are then unknown.
- Report numbers and units exactly as written.
- takeaway and plainSummary must only use the facts you extracted. Say when a study was done in animals or cells, not people.`;

/**
 * The reply format, in place of Mastra's generated schema dump: Gemma copied the dump's
 * structure and answered `"takeaway": {"string": "..."}`. A filled-in template it follows.
 * The reply is still validated against `cardOutputSchema`.
 */
const OUTPUT_FORMAT = `Reply with only a JSON object, no code fences, in exactly this shape:
{
${cardFieldKeys
  .map(
    (k) =>
      `  "${k}": {"quote": "...", "value": "...", "status": "stated"},  // ${cardFields[k].hint}`,
  )
  .join("\n")}
  "takeaway": "...",  // ${cardOutputSchema.shape.takeaway.description}
  "plainSummary": "..."  // ${cardOutputSchema.shape.plainSummary.description}
}
A fact the abstract does not state is {"quote": null, "value": null, "status": "unknown"}. takeaway and plainSummary are plain strings. No comments in the reply.`;

/** Card generation through a Mastra agent on the model named by `modelId` (AI SDK model router). */
export function createCardGenerator(modelId: string): GenerateCard {
  const agent = new Agent({
    id: "study-card",
    name: "Study card extractor",
    instructions: INSTRUCTIONS,
    model: modelId,
  });

  return async ({ title, abstract }) => {
    const started = Date.now();
    try {
      const res = await agent.generate(`Title: ${title}\n\nAbstract:\n${abstract}`, {
        // Gemma 4 on the Gemini API, tried 2026-10-04: native schema mode let stray tokens
        // into values ("2.emannine 2.5 g") and looped at temperature 0; with thinking left on
        // it reasoned for over a minute. Prompted JSON, minimal thinking and a little
        // temperature gave clean cards in ~10 s.
        structuredOutput: {
          schema: cardOutputSchema,
          jsonPromptInjection: true,
          instructions: OUTPUT_FORMAT,
        },
        modelSettings: { temperature: 0.2 },
        providerOptions: { google: { thinkingConfig: { thinkingLevel: "minimal" } } },
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.object) throw new ModelError("The model returned no card", 502);
      return {
        output: res.object,
        modelId,
        latencyMs: Date.now() - started,
        inputTokens: res.usage?.inputTokens ?? null,
        outputTokens: res.usage?.outputTokens ?? null,
      };
    } catch (err) {
      throw toModelError(err);
    }
  };
}

function toModelError(err: unknown): ModelError {
  if (err instanceof ModelError) return err;
  if (err instanceof DOMException && err.name === "TimeoutError") {
    return new ModelError(`The model took longer than ${TIMEOUT_MS / 1000} s. Try again.`, 502);
  }
  const status = (err as { statusCode?: number } | null)?.statusCode;
  const message = err instanceof Error ? err.message : String(err);
  if (status === 429) {
    return new ModelError("The model provider is rate limiting us. Try again in a minute.", 429);
  }
  if (/api key/i.test(message)) {
    return new ModelError(`Model not configured: ${message}`, 503);
  }
  return new ModelError(`Model call failed: ${message}`, 502);
}
