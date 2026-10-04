import { describe, expect, it } from "vitest";
import { ModelError } from "./card-agent.js";
import {
  type CheckQuery,
  createQuerySuggester,
  parseReply,
  type RunQueryAgent,
} from "./query-agent.js";

/** A model stand-in: `script` plays the agent, calling the hit-count tool as it likes. */
function setup(
  script: (intent: string, check: CheckQuery) => Promise<string>,
  hits: Record<string, number> = {},
  opts: { maxChecks?: number; retryDelaysMs?: number[] } = {},
) {
  const counted: string[] = [];
  const logs: string[] = [];
  const runAgent: RunQueryAgent = async (intent, check) => ({
    text: await script(intent, check),
    modelId: "fake/model",
    inputTokens: 10,
    outputTokens: 5,
  });
  const suggest = createQuerySuggester({
    runAgent,
    countHits: async (q) => {
      counted.push(q);
      return hits[q] ?? 0;
    },
    log: (line) => logs.push(line),
    retryDelaysMs: opts.retryDelaysMs ?? [0, 0],
    maxChecks: opts.maxChecks,
  });
  return { suggest, counted, logs };
}

const answer = (query: string, explanation = "Why.", hitCount = 999) =>
  JSON.stringify({ query, hitCount, explanation });

describe("createQuerySuggester", () => {
  it("returns the model's query with the hit count our code measured", async () => {
    const t = setup(
      async (_intent, check) => {
        await check("gut");
        await check('TITLE_ABS:"gut health"');
        return answer('TITLE_ABS:"gut health"', "Gut health in titles.", 123456);
      },
      { gut: 90_000, 'TITLE_ABS:"gut health"': 800 },
    );

    const res = await t.suggest("gut health");

    expect(res).toMatchObject({
      query: 'TITLE_ABS:"gut health"',
      hitCount: 800,
      explanation: "Gut health in titles.",
      checks: [
        { query: "gut", hitCount: 90_000 },
        { query: 'TITLE_ABS:"gut health"', hitCount: 800 },
      ],
      modelId: "fake/model",
    });
    // The final query was already counted: no extra Europe PMC call.
    expect(t.counted).toEqual(["gut", 'TITLE_ABS:"gut health"']);
    expect(t.logs.some((l) => l.includes("count_hits") && l.includes("90000"))).toBe(true);
    expect(t.logs.at(-1)).toMatch(/^suggest .*checks=2/);
  });

  it("tells the model whether the count is in range", async () => {
    const replies: unknown[] = [];
    const t = setup(
      async (_i, check) => {
        replies.push(await check("a"), await check("b"), await check("c"));
        return answer("b");
      },
      { a: 0, b: 600, c: 2_000_000 },
    );
    await t.suggest("x");
    expect(replies).toEqual([
      expect.objectContaining({ hitCount: 0, verdict: expect.stringMatching(/no hits/i) }),
      expect.objectContaining({ hitCount: 600, verdict: expect.stringMatching(/good/i) }),
      expect.objectContaining({ verdict: expect.stringMatching(/too many/i) }),
    ]);
  });

  it("counts a final query the model never checked", async () => {
    const t = setup(async () => answer("magnesium AND sleep"), { "magnesium AND sleep": 300 });
    const res = await t.suggest("magnesium for sleep");
    expect(res.hitCount).toBe(300);
    expect(t.counted).toEqual(["magnesium AND sleep"]);
  });

  it("stops counting after the check limit", async () => {
    const results: unknown[] = [];
    const t = setup(
      async (_i, check) => {
        for (const q of ["a", "b", "c"]) results.push(await check(q));
        return answer("b");
      },
      { a: 1, b: 100, c: 5 },
      { maxChecks: 2 },
    );
    const res = await t.suggest("x");
    expect(results[2]).toEqual({ error: expect.stringMatching(/final answer/i) });
    expect(t.counted).toEqual(["a", "b"]);
    expect(res.query).toBe("b");
  });

  it("rejects a query Europe PMC would refuse without counting it", async () => {
    let result: unknown;
    const t = setup(
      async (_i, check) => {
        result = await check("x".repeat(2000));
        return answer("ok");
      },
      { ok: 100 },
    );
    await t.suggest("x");
    expect(result).toEqual({ error: expect.stringMatching(/too long/i) });
    expect(t.counted).toEqual(["ok"]);
  });

  it("falls back to the best checked query when the final one finds nothing", async () => {
    const t = setup(
      async (_i, check) => {
        await check("broad");
        await check("good");
        return answer('MESH:"Made Up"');
      },
      { broad: 400_000, good: 1_200 },
    );
    const res = await t.suggest("x");
    expect(res).toMatchObject({ query: "good", hitCount: 1_200 });
  });

  it("falls back to the best checked query when the reply is not JSON", async () => {
    const t = setup(
      async (_i, check) => {
        await check("narrow");
        await check("broad");
        return "I could not decide.";
      },
      { narrow: 3, broad: 9_000 },
    );
    const res = await t.suggest("x");
    // 9,000 is nearer the 50–5,000 range than 3 (on a log scale).
    expect(res).toMatchObject({ query: "broad", hitCount: 9_000, explanation: "" });
  });

  it("fails with a 502 when the model gives nothing usable", async () => {
    const t = setup(async () => "No idea.");
    await expect(t.suggest("x")).rejects.toMatchObject({ status: 502 });
  });

  it("retries a rate-limited model call, then gives up with a 429", async () => {
    let calls = 0;
    const flaky = setup(
      async () => {
        calls++;
        if (calls < 3) throw new ModelError("rate limited", 429);
        return answer("q");
      },
      { q: 100 },
    );
    expect((await flaky.suggest("x")).query).toBe("q");
    expect(calls).toBe(3);

    const limited = setup(async () => {
      throw new ModelError("rate limited", 429);
    });
    await expect(limited.suggest("x")).rejects.toMatchObject({ status: 429 });
  });

  it("gives up on a model call that ignores its abort signal", async () => {
    const runAgent: RunQueryAgent = () => new Promise(() => {});
    const suggest = createQuerySuggester({
      runAgent,
      countHits: async () => 0,
      log: () => {},
      timeoutMs: 20,
    });
    await expect(suggest("x")).rejects.toMatchObject({
      status: 502,
      message: expect.stringMatching(/longer than/),
    });
  });

  it("gives a retry after a 429 a fresh check budget", async () => {
    let attempt = 0;
    const second: unknown[] = [];
    const t = setup(
      async (_i, check) => {
        attempt++;
        if (attempt === 1) {
          for (const q of ["a", "b"]) await check(q);
          throw new ModelError("rate limited", 429);
        }
        second.push(await check("c"), await check("d"));
        return answer("d");
      },
      { a: 1, b: 2, c: 3, d: 300 },
      { maxChecks: 2 },
    );
    const res = await t.suggest("x");
    expect(second).toEqual([
      expect.objectContaining({ hitCount: 3 }),
      expect.objectContaining({ hitCount: 300 }),
    ]);
    expect(res).toMatchObject({ query: "d", hitCount: 300 });
    // The record keeps every check, across attempts.
    expect(res.checks.map((c) => c.query)).toEqual(["a", "b", "c", "d"]);
  });

  it("holds one deadline across retries and their backoff", async () => {
    const suggest = createQuerySuggester({
      runAgent: async () => {
        throw new ModelError("rate limited", 429);
      },
      countHits: async () => 0,
      log: () => {},
      retryDelaysMs: [10_000, 10_000],
      timeoutMs: 30,
    });
    const started = Date.now();
    await expect(suggest("x")).rejects.toMatchObject({ message: expect.stringMatching(/longer/) });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("stops the model call when the caller aborts", async () => {
    let seen: AbortSignal | null = null;
    const suggest = createQuerySuggester({
      runAgent: (_i, _c, signal) => {
        seen = signal;
        return new Promise(() => {});
      },
      countHits: async () => 0,
      log: () => {},
    });
    const caller = new AbortController();
    const pending = suggest("x", caller.signal);
    await new Promise((r) => setTimeout(r, 5));
    caller.abort();
    await expect(pending).rejects.toBeInstanceOf(ModelError);
    expect((seen as AbortSignal | null)?.aborted).toBe(true);
  });

  it("leaves the queue without calling the model when aborted while waiting", async () => {
    const intents: string[] = [];
    let release = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const suggest = createQuerySuggester({
      runAgent: async (intent) => {
        intents.push(intent);
        await gate;
        return { text: answer("q"), modelId: "m", inputTokens: 1, outputTokens: 1 };
      },
      countHits: async () => 100,
      log: () => {},
    });
    const busy = [suggest("one"), suggest("two")];
    const caller = new AbortController();
    const queued = suggest("three", caller.signal);
    await new Promise((r) => setTimeout(r, 5));
    caller.abort();
    await expect(queued).rejects.toBeInstanceOf(ModelError);
    release();
    await Promise.all(busy);
    // A later call still gets a slot: the aborted waiter didn't leak one.
    await suggest("four");
    expect(intents).toEqual(["one", "two", "four"]);
  });

  it("runs at most two model calls at once", async () => {
    let running = 0;
    let peak = 0;
    const t = setup(
      async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
        return answer("q");
      },
      { q: 100 },
    );
    await Promise.all([1, 2, 3, 4, 5].map((n) => t.suggest(`intent ${n}`)));
    expect(peak).toBe(2);
  });
});

describe("parseReply", () => {
  it("reads JSON inside code fences or prose", () => {
    expect(parseReply('```json\n{"query": "a AND b", "explanation": "E."}\n```')).toEqual({
      query: "a AND b",
      explanation: "E.",
    });
    expect(parseReply('Here it is: {"query": "q"} done')).toEqual({ query: "q", explanation: "" });
  });

  it("returns null for anything without a query", () => {
    expect(parseReply("nothing")).toBeNull();
    expect(parseReply('{"query": ""}')).toBeNull();
    expect(parseReply("{broken")).toBeNull();
  });
});
