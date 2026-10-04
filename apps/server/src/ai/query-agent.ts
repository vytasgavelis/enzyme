import { type QuerySuggestion, USEFUL_HITS } from "@enzyme/shared";
import { Agent } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { buildQuery, EuropePmcError } from "../sources/europepmc.js";
import { ModelError, toModelError } from "./card-agent.js";

/**
 * Plain-English intent → Europe PMC query (T-11, EN-25). A Mastra agent writes a query and
 * checks it with a `count_hits` tool, revising until the count is useful. Our code wraps the
 * tool: it does the counting, records every check, caps the number of checks and decides the
 * final answer, so a model that misreports a count or answers unchecked can't mislead the UI.
 *
 * Gemma 4 tool calling through Mastra worked first time in a spike (2026-10-04): 7 of 7 intents,
 * 1–3 tool calls each, 6–12 s. So the loop is the model's, not a hand-written one.
 */

/** Model checks per suggestion; the agent is told 3, the 4th is slack. */
const MAX_CHECKS = 4;
/**
 * One deadline for the whole suggestion: limiter wait, every attempt and the backoff between
 * them. Kept below the web client's 75 s timeout so the server gives up first.
 */
const TIMEOUT_MS = 60_000;
/** Shared free-tier key: keep the agent's model calls to two at a time. */
const MAX_CONCURRENT = 2;
/** Waits before retrying a rate-limited attempt. */
const RETRY_DELAYS_MS = [3_000, 8_000];

/** What `count_hits` answers: the count with a hint, or why it did not count. */
export type CheckResult = { hitCount: number; verdict: string } | { error: string };
export type CheckQuery = (query: string) => Promise<CheckResult>;

export interface AgentReply {
  text: string;
  modelId: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** One agent run: the model may call `check` (the hit-count tool) and returns its final text. */
export type RunQueryAgent = (
  intent: string,
  check: CheckQuery,
  signal: AbortSignal,
) => Promise<AgentReply>;

/** Europe PMC hits for a query, counted the way a pull would fetch it (with abstracts only). */
export type CountHits = (query: string) => Promise<number>;

export interface QueryCheck {
  query: string;
  hitCount: number;
}

export interface QuerySuggestionResult extends QuerySuggestion {
  /** Every query the agent checked, in order. */
  checks: QueryCheck[];
  modelId: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** `signal` is the caller's (the HTTP request's): aborting it stops waiting and the model call. */
export type SuggestQuery = (intent: string, signal?: AbortSignal) => Promise<QuerySuggestionResult>;

export interface QuerySuggesterDeps {
  runAgent: RunQueryAgent;
  countHits: CountHits;
  log?: (line: string) => void;
  maxChecks?: number;
  retryDelaysMs?: number[];
  timeoutMs?: number;
}

export function createQuerySuggester(deps: QuerySuggesterDeps): SuggestQuery {
  const {
    runAgent,
    countHits,
    log = console.log,
    maxChecks = MAX_CHECKS,
    retryDelaysMs = RETRY_DELAYS_MS,
    timeoutMs = TIMEOUT_MS,
  } = deps;
  const limit = limiter(MAX_CONCURRENT);

  return async (intent, callerSignal) => {
    const started = Date.now();
    const deadline = AbortSignal.timeout(timeoutMs);
    const signal = callerSignal ? AbortSignal.any([deadline, callerSignal]) : deadline;
    /** Every query counted in this suggestion, across attempts (the fallback picks from it). */
    const checks: QueryCheck[] = [];
    /** Checks the current attempt has used; a retry after a 429 starts with a fresh budget. */
    let budgetUsed = 0;
    const tag = `suggest intent=${JSON.stringify(intent.slice(0, 60))}`;

    const count = async (query: string): Promise<number> => {
      const seen = checks.find((c) => c.query === query);
      if (seen) return seen.hitCount;
      const hitCount = await countHits(query);
      checks.push({ query, hitCount });
      return hitCount;
    };

    const check: CheckQuery = async (raw) => {
      const query = raw.trim();
      if (budgetUsed >= maxChecks) {
        log(`${tag} count_hits refused (limit ${maxChecks}) q=${JSON.stringify(query)}`);
        return { error: "No more checks. Give your final answer now." };
      }
      try {
        buildQuery(query);
      } catch (err) {
        if (err instanceof EuropePmcError) return { error: err.message };
        throw err;
      }
      budgetUsed++;
      const hitCount = await count(query);
      log(`${tag} count_hits #${budgetUsed} hits=${hitCount} q=${JSON.stringify(query)}`);
      return { hitCount, verdict: verdict(hitCount) };
    };

    // Race the signal too, so the request ends on time even if a model step or tool call
    // doesn't honour the abort signal.
    const aborted = new Promise<never>((_, reject) => {
      if (signal.aborted) reject(signal.reason);
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
    aborted.catch(() => {});

    let reply: AgentReply;
    try {
      reply = await limit(
        () =>
          withRetry(
            () => {
              budgetUsed = 0;
              return Promise.race([runAgent(intent, check, signal), aborted]);
            },
            retryDelaysMs,
            signal,
          ),
        signal,
      );
    } catch (err) {
      throw toModelError(err, timeoutMs);
    }

    const parsed = parseReply(reply.text);
    let pick: QueryCheck | null = null;
    if (parsed) {
      try {
        buildQuery(parsed.query);
        pick = { query: parsed.query, hitCount: await count(parsed.query) };
      } catch (err) {
        if (!(err instanceof EuropePmcError && err.kind === "invalid_request")) throw err;
      }
    }
    // A final answer that finds nothing (or was unusable) loses to the best query it checked.
    if (!pick || pick.hitCount === 0) pick = bestCheck(checks) ?? pick;
    if (!pick || pick.hitCount === 0) {
      log(`${tag} failed: no usable query; reply=${JSON.stringify(reply.text.slice(0, 200))}`);
      throw new ModelError("The model did not come up with a query that finds papers.", 502);
    }

    const result: QuerySuggestionResult = {
      query: pick.query,
      hitCount: pick.hitCount,
      explanation: parsed && parsed.query === pick.query ? parsed.explanation : "",
      checks,
      modelId: reply.modelId,
      latencyMs: Date.now() - started,
      inputTokens: reply.inputTokens,
      outputTokens: reply.outputTokens,
    };
    log(
      `${tag} ms=${result.latencyMs} checks=${checks.length} hits=${result.hitCount} in=${result.inputTokens ?? "?"} out=${result.outputTokens ?? "?"} q=${JSON.stringify(result.query)}`,
    );
    return result;
  };
}

function verdict(hitCount: number): string {
  if (hitCount === 0) {
    return "No hits: the syntax may be wrong (an unknown field or MeSH heading) or the query is too narrow. Revise it.";
  }
  if (hitCount < USEFUL_HITS.min)
    return `Too few (aim for ${USEFUL_HITS.min}–${USEFUL_HITS.max}). Widen it.`;
  if (hitCount > USEFUL_HITS.max)
    return `Too many (aim for ${USEFUL_HITS.min}–${USEFUL_HITS.max}). Narrow it.`;
  return "Good: in the useful range.";
}

/** How far a count is from the useful range, on a log scale (0 inside it). */
function distance(hitCount: number): number {
  if (hitCount <= 0) return Number.POSITIVE_INFINITY;
  if (hitCount < USEFUL_HITS.min) return Math.log(USEFUL_HITS.min / hitCount);
  if (hitCount > USEFUL_HITS.max) return Math.log(hitCount / USEFUL_HITS.max);
  return 0;
}

/** The checked query nearest the useful range; the later one wins a tie (it was revised). */
function bestCheck(checks: QueryCheck[]): QueryCheck | null {
  let best: QueryCheck | null = null;
  for (const c of checks) {
    if (c.hitCount > 0 && (!best || distance(c.hitCount) <= distance(best.hitCount))) best = c;
  }
  return best;
}

const replySchema = z.object({
  query: z.string().trim().min(1),
  explanation: z.string().trim().catch("").default(""),
});

/** The `{query, explanation}` object in the model's reply, which may sit in fences or prose. */
export function parseReply(text: string): { query: string; explanation: string } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = replySchema.safeParse(JSON.parse(text.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Retries a rate-limited call (429) after each delay in turn, until `signal` aborts. */
async function withRetry<T>(
  fn: () => Promise<T>,
  delaysMs: number[],
  signal: AbortSignal,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const delay = delaysMs[attempt];
      const rateLimited = toModelError(err).status === 429;
      if (!rateLimited || delay === undefined || signal.aborted) throw err;
      await sleep(delay, signal);
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Runs at most `max` of the given tasks at once; the rest wait their turn. A waiter whose
 * signal aborts leaves the queue.
 */
function limiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>, signal: AbortSignal): Promise<T> => {
    if (signal.aborted) throw signal.reason;
    if (active >= max) {
      await new Promise<void>((resolve, reject) => {
        const wake = () => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        };
        const onAbort = () => {
          waiting.splice(waiting.indexOf(wake), 1);
          reject(signal.reason);
        };
        waiting.push(wake);
        signal.addEventListener("abort", onAbort, { once: true });
      });
    }
    active++;
    try {
      return await task();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

// ---------------------------------------------------------------------------------------------
// The Mastra agent

const INSTRUCTIONS = `You write Europe PMC search queries for a health researcher. She describes what she wants in plain English; you find a query that gives her a focused, readable feed of papers.

How to work:
1. Write a query for her description and call count_hits with it.
2. Aim for ${USEFUL_HITS.min} to ${USEFUL_HITS.max} hits. If count_hits says too many, narrow the query; if too few or none, widen it or fix the syntax. Then check again. Use at most 3 checks.
3. Reply with the best query you checked.

Europe PMC query syntax:
- Words and "exact phrases", combined with AND, OR, NOT and brackets. A trailing * matches word endings: probiotic*.
- TITLE_ABS:"phrase" matches the title or abstract. Prefer it to bare words, which also match the full text and pull in off-topic papers.
- TITLE:"phrase" matches the title only. It is the best way to narrow a broad topic.
- Never use MESH: or other fields. MESH: also matches papers that only mention the term somewhere in the full text, so it pulls in off-topic papers.
- PUB_TYPE:"Review", PUB_TYPE:"Systematic Review", PUB_TYPE:"Meta-Analysis", PUB_TYPE:"Randomized Controlled Trial" limit the kind of paper.

Rules:
- Stay on her topic. For each concept, OR together its common synonyms and abbreviations, e.g. (TITLE_ABS:"irritable bowel syndrome" OR TITLE_ABS:IBS).
- To narrow a broad topic, go down this ladder, one step per check, skipping steps when the count is far too high: (a) move its main terms to TITLE:; (b) add (PUB_TYPE:"Review" OR PUB_TYPE:"Systematic Review" OR PUB_TYPE:"Meta-Analysis" OR PUB_TYPE:"Randomized Controlled Trial"); (c) keep only PUB_TYPE:"Systematic Review" OR PUB_TYPE:"Meta-Analysis". Never add a subtopic or outcome she did not ask for.
- Counts already include only papers with an abstract. Don't add HAS_ABSTRACT or date ranges.

Your final reply is only a JSON object, no code fences:
{"query": "<the query>", "explanation": "<one plain-English sentence for her on what the query finds>"}`;

interface QueryContext {
  check: CheckQuery;
}

const countHitsTool = createTool({
  id: "count_hits",
  description:
    "Counts the Europe PMC papers (with an abstract) that a query finds, and says whether the count is in the useful range.",
  inputSchema: z.object({ query: z.string().describe("The Europe PMC query to count") }),
  execute: async ({ query }, { requestContext }) => {
    const check = (requestContext as RequestContext<QueryContext>).get("check");
    return check(query);
  },
});

/** The query agent. Its tool reaches the per-request `check` through the request context. */
export function createQueryAgent(modelId: string) {
  return new Agent({
    id: "query-writer",
    name: "Europe PMC query writer",
    instructions: INSTRUCTIONS,
    model: modelId,
    tools: { count_hits: countHitsTool },
  });
}

/** `RunQueryAgent` on a Mastra agent, with the Gemma settings from T-7 (see card-agent.ts). */
export function mastraQueryRunner(agent: Agent, modelId: string): RunQueryAgent {
  return async (intent, check, signal) => {
    const requestContext = new RequestContext<QueryContext>([["check", check]]);
    const res = await agent.generate(intent, {
      requestContext,
      maxSteps: MAX_CHECKS + 2,
      modelSettings: { temperature: 0.2 },
      providerOptions: { google: { thinkingConfig: { thinkingLevel: "minimal" } } },
      abortSignal: signal,
    });
    // Summed over every step (each tool round trip is another model call).
    const usage = res.totalUsage ?? res.usage;
    return {
      text: res.text,
      modelId,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
    };
  };
}
