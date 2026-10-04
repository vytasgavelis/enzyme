import { type CardField, type CardFieldKey, cardFieldKeys, type StudyCard } from "@enzyme/shared";
import { describe, expect, it } from "vitest";
import type { Judge } from "./judge.js";
import { createFaithfulnessScorer, quoteCheckScorer, unknownDisciplineScorer } from "./scorers.js";
import {
  type BenchRow,
  backoffMs,
  classifyFailure,
  DeadlineError,
  faithfulness,
  limiter,
  PausedError,
  parseJudgeReply,
  pauseWatch,
  quoteCheck,
  type RetryStats,
  summarise,
  summaryTable,
  toCsv,
  unknownDiscipline,
  withDeadline,
  withRetry,
} from "./scores.js";

const source = {
  title: "Curcumin in adults with ulcerative colitis",
  abstract:
    "In this randomised placebo-controlled trial, 60 adults with ulcerative colitis took curcumin 500 mg twice daily for 8 weeks. Remission was higher with curcumin (p = 0.01). This work was supported by a grant from the National Science Council.",
};

const unknown: CardField = { value: null, quote: null, status: "unknown" };
const stated = (value: string, quote: string): CardField => ({ value, quote, status: "stated" });
const suspect = (value: string, quote: string | null): CardField => ({
  value,
  quote,
  status: "suspect",
});

function card(fields: Partial<Record<CardFieldKey, CardField>>): StudyCard {
  const all = Object.fromEntries(cardFieldKeys.map((k) => [k, fields[k] ?? unknown]));
  return {
    ...(all as Record<CardFieldKey, CardField>),
    takeaway: "Curcumin helped.",
    plainSummary: "Adults took curcumin.",
  };
}

describe("quoteCheck", () => {
  it("counts verified, suspect and unknown fields", () => {
    const q = quoteCheck(
      card({
        design: stated("RCT", "randomised placebo-controlled trial"),
        sampleSize: stated("60 adults", "60 adults"),
        duration: suspect("12 weeks", "for 12 weeks"),
      }),
    );
    expect(q).toEqual({ given: 3, stated: 2, suspect: 1, unknown: 9, rate: 2 / 3 });
  });

  it("has no rate when the model gave no values", () => {
    expect(quoteCheck(card({})).rate).toBeNull();
  });
});

describe("unknownDiscipline", () => {
  it("scores 1 when rarely-stated fields are unknown or supported", () => {
    const u = unknownDiscipline(
      card({
        doseOrRegimen: stated("500 mg twice daily", "curcumin 500 mg twice daily"),
        duration: stated("8 weeks", "for 8 weeks"),
        fundingOrCoi: stated("National Science Council grant", "supported by a grant"),
      }),
      source,
    );
    expect(u).toMatchObject({ guessed: [], doseFundingGuesses: [], leftUnknown: 2, score: 1 });
  });

  it("counts a suspect rarely-stated field as a guess, but not a suspect common field", () => {
    const u = unknownDiscipline(
      card({
        limitations: suspect("small sample", "small sample size"),
        population: suspect("adults", "people"),
      }),
      source,
    );
    expect(u.guessed).toEqual(["limitations"]);
    expect(u.score).toBeCloseTo(0.8);
  });

  it("counts a dose whose number is not in the abstract against the model", () => {
    const u = unknownDiscipline(
      card({ doseOrRegimen: stated("1000 mg twice daily", "curcumin 500 mg twice daily") }),
      source,
    );
    expect(u.doseFundingGuesses).toEqual(["doseOrRegimen"]);
  });

  it("counts a verified quote that is not a dose or funding statement against the model", () => {
    const u = unknownDiscipline(
      card({
        doseOrRegimen: stated("curcumin", "took curcumin"),
        fundingOrCoi: stated("none declared", "Remission was higher"),
      }),
      source,
    );
    expect(u.doseFundingGuesses).toEqual(["doseOrRegimen", "fundingOrCoi"]);
    expect(u.score).toBeCloseTo(0.6);
  });
});

describe("parseJudgeReply and faithfulness", () => {
  it("parses a fenced reply and scores the supported share", () => {
    const reply = parseJudgeReply(
      '```json\n{"claims": [{"claim": "60 adults", "supported": true}, {"claim": "cures colitis", "supported": false}]}\n```',
    );
    expect(faithfulness(reply)).toEqual({ claims: 2, unsupported: ["cures colitis"], score: 0.5 });
  });

  it("has no score without claims and rejects replies without JSON", () => {
    expect(faithfulness({ claims: [] }).score).toBeNull();
    expect(() => parseJudgeReply("I cannot judge this")).toThrow();
    expect(() => parseJudgeReply('{"claims": [{"claim": "x"}]}')).toThrow();
  });
});

describe("classifyFailure", () => {
  it("retries rate limits and server errors only", () => {
    expect(classifyFailure(Object.assign(new Error("slow down"), { status: 429 }))).toEqual({
      kind: "rate-limit",
      retryable: true,
    });
    expect(classifyFailure(new Error("Model call failed: 503 Service Unavailable"))).toEqual({
      kind: "server",
      retryable: true,
    });
    expect(classifyFailure(new Error("The model took longer than 90 s. Try again.")).kind).toBe(
      "timeout",
    );
    expect(
      classifyFailure(new Error("Model call failed: Structured output validation failed: x")).kind,
    ).toBe("invalid-json");
    expect(classifyFailure(new Error("boom"))).toEqual({ kind: "other", retryable: false });
  });
});

describe("withRetry", () => {
  const rateLimited = () => Object.assign(new Error("rate limited"), { status: 429 });

  it("retries 429s with growing waits, then succeeds", async () => {
    const waits: number[] = [];
    const stats: RetryStats = { attempts: 0, rateLimited: 0, serverErrors: 0 };
    let calls = 0;
    const result = await withRetry(
      async () => {
        if (++calls < 3) throw rateLimited();
        return "ok";
      },
      stats,
      { baseMs: 100, sleep: async (ms) => void waits.push(ms) },
    );
    expect(result).toBe("ok");
    expect(stats).toEqual({ attempts: 3, rateLimited: 2, serverErrors: 0 });
    expect(waits[0]).toBeGreaterThanOrEqual(75);
    expect(waits[1]).toBeGreaterThanOrEqual(150);
  });

  it("gives up after maxAttempts and does not retry timeouts", async () => {
    const stats: RetryStats = { attempts: 0, rateLimited: 0, serverErrors: 0 };
    const sleep = async () => {};
    await expect(
      withRetry(() => Promise.reject(rateLimited()), stats, { maxAttempts: 2, sleep }),
    ).rejects.toThrow("rate limited");
    expect(stats.attempts).toBe(2);
    await expect(
      withRetry(() => Promise.reject(new Error("took longer")), stats, { sleep }),
    ).rejects.toThrow();
    expect(stats.attempts).toBe(3);
  });

  it("backs off exponentially", () => {
    expect(backoffMs(0, 1000, () => 0.5)).toBe(1000);
    expect(backoffMs(3, 1000, () => 0.5)).toBe(8000);
  });
});

describe("withDeadline", () => {
  it("abandons a call that runs past the hard deadline", async () => {
    const hang = () => new Promise<string>(() => {});
    await expect(withDeadline(hang, { hardMs: 10, softMs: 5 })).rejects.toThrow("timed out");
    expect(classifyFailure(new DeadlineError("timed out after 0.01 s")).kind).toBe("timeout");
  });

  it("reports a failure after the soft deadline as a timeout, earlier ones as they are", async () => {
    const failAfter = (ms: number) => () =>
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("The model returned no card")), ms),
      );
    await expect(withDeadline(failAfter(20), { hardMs: 1000, softMs: 10 })).rejects.toThrow(
      /timed out after .* \(The model returned no card\)/,
    );
    await expect(withDeadline(failAfter(1), { hardMs: 1000, softMs: 500 })).rejects.toThrow(
      /^The model returned no card$/,
    );
    await expect(withDeadline(async () => "ok", { hardMs: 1000, softMs: 500 })).resolves.toBe("ok");
  });
});

describe("pauseWatch", () => {
  it("records a gap between ticks as a pause and finds calls that overlap it", () => {
    let t = 1_000;
    const watch = pauseWatch(10_000, 60_000, () => t);
    t = 2_000;
    watch.tick();
    t = 500_000; // the machine slept
    watch.tick();
    watch.stop();
    expect(watch.pauses).toEqual([{ from: 2_000, to: 500_000 }]);
    expect(watch.overlaps(1_500, 501_000)).toBe(true);
    expect(watch.overlaps(500_100, 520_000)).toBe(false);
    expect(classifyFailure(new PausedError("paused"))).toEqual({
      kind: "vm-paused",
      retryable: true,
    });
  });
});

describe("limiter", () => {
  it("never runs more than the limit at once", async () => {
    const slot = limiter(2);
    let active = 0;
    let peak = 0;
    const task = () =>
      slot(async () => {
        peak = Math.max(peak, ++active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
      });
    await Promise.all(Array.from({ length: 7 }, task));
    expect(peak).toBe(2);
  });
});

describe("summaries", () => {
  const row = (over: Partial<BenchRow>): BenchRow => ({
    model: "google/a",
    paperId: 1,
    title: 'A "quoted", title',
    ok: true,
    failure: "",
    error: "",
    latencyMs: 1000,
    inputTokens: 100,
    outputTokens: 50,
    attempts: 1,
    rateLimited: 0,
    given: 4,
    stated: 3,
    suspect: 1,
    unknown: 8,
    quoteCheckRate: 0.75,
    rarelyStatedGuesses: "",
    doseFundingGuesses: "",
    unknownDiscipline: 1,
    judgeModel: "google/b",
    claims: 4,
    unsupportedClaims: 1,
    faithfulness: 0.75,
    judgeLatencyMs: 500,
    judgeError: "",
    ...over,
  });

  it("pools rates over cards and counts failures", () => {
    const rows = [
      row({}),
      row({ paperId: 2, given: 6, stated: 6, latencyMs: 3000, unknownDiscipline: 0.6 }),
      row({ paperId: 2, doseFundingGuesses: "doseOrRegimen;fundingOrCoi" }),
      row({ paperId: 3, ok: false, failure: "timeout", latencyMs: null, rateLimited: 2 }),
    ];
    const s = summarise("google/a", rows);
    expect(s).toMatchObject({ papers: 4, ok: 3, failures: { timeout: 1 }, rateLimited: 2 });
    expect(s.quoteCheckRate).toBeCloseTo(12 / 14);
    expect(s.unknownDiscipline).toBeCloseTo(2.6 / 3);
    expect(s.doseFundingGuesses).toBe(2);
    expect(s.faithfulness).toBeCloseTo(0.75);
    expect(s.medianLatencyMs).toBe(1000);
    const table = summaryTable([s], { "google/a": "google/b" });
    expect(table).toContain("| Metric | a |");
    expect(table).toContain("| Judged by | b |");
    expect(table).toContain("| Failures | 1 timeout |");
  });

  it("escapes CSV cells", () => {
    const csv = toCsv([row({})]);
    expect(csv.split("\n")[1]).toContain('"A ""quoted"", title"');
    expect(csv.split("\n")[1]).toContain(",0.750,");
  });
});

describe("Mastra scorers", () => {
  const theCard = card({
    design: stated("RCT", "randomised placebo-controlled trial"),
    doseOrRegimen: stated("750 mg daily", "curcumin 500 mg twice daily"),
  });
  const run = { input: source, output: { card: theCard } };

  it("score the quote check rate and unknown discipline", async () => {
    const q = await quoteCheckScorer.run(run);
    expect(q.score).toBe(1);
    expect(q.reason).toBe("2 of 2 values verified, 0 suspect, 10 unknown");
    const u = await unknownDisciplineScorer.run(run);
    expect(u.score).toBeCloseTo(0.8);
    expect(u.reason).toBe("Guessed: doseOrRegimen");
  });

  it("scores faithfulness with the given judge and records judge failures", async () => {
    const judge: Judge = async () => ({
      reply: {
        claims: [
          { claim: "an RCT", supported: true },
          { claim: "in children", supported: false },
        ],
      },
      judgeModel: "google/b",
      latencyMs: 1,
    });
    const f = await createFaithfulnessScorer(judge).run(run);
    expect(f.score).toBe(0.5);
    expect(f.reason).toBe("Unsupported: in children");

    const failing = await createFaithfulnessScorer(async () => {
      throw new Error("judge timed out");
    }).run(run);
    expect(failing.score).toBeUndefined();
    expect(failing.analyzeStepResult?.error).toBe("judge timed out");
  });
});
