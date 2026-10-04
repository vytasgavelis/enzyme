/**
 * Pure scoring functions for the model benchmark (T-12, EN-38). The Mastra scorers in
 * `scorers.ts` wrap these; keeping them plain makes them easy to unit test.
 */
import { type CardFieldKey, cardFieldKeys, quoteInText, type StudyCard } from "@enzyme/shared";
import { z } from "zod";

/** Fields the abstract rarely states. The card prompt tells the model to leave them unknown. */
export const rarelyStatedFields: CardFieldKey[] = [
  "comparator",
  "doseOrRegimen",
  "duration",
  "limitations",
  "fundingOrCoi",
];

export interface QuoteCheck {
  /** Fields the model gave a value for (stated + suspect). */
  given: number;
  /** Values whose quote was found in the title or abstract. */
  stated: number;
  /** Values whose quote is missing or not in the source. */
  suspect: number;
  unknown: number;
  /** stated / given; null when the model gave no values. */
  rate: number | null;
}

/** Quote check rate: share of the values the model gave whose quote `checkCard` verified. */
export function quoteCheck(card: StudyCard): QuoteCheck {
  let stated = 0;
  let suspect = 0;
  for (const k of cardFieldKeys) {
    if (card[k].status === "stated") stated++;
    else if (card[k].status === "suspect") suspect++;
  }
  const given = stated + suspect;
  return {
    given,
    stated,
    suspect,
    unknown: cardFieldKeys.length - given,
    rate: given === 0 ? null : stated / given,
  };
}

const numbers = (s: string) => s.match(/\d+(?:[.,]\d+)?/g) ?? [];
const DOSE_WORDS =
  /\d|\bdaily\b|\bweekly\b|\btwice\b|\bonce\b|\btimes\b|\bdose|\bper (?:day|week)\b|\bmg\b|\bg\/kg\b/i;
const FUNDING_WORDS =
  /fund|grant|sponsor|financ|support(?:ed)? by|conflicts? of interest|competing interest|foundation|council/i;

/**
 * Whether a dose or funding value is backed by the abstract: its quote must be verified, look
 * like a dose (numbers, frequency) or a funding statement, and every number in the value must
 * appear in the source. A plausible-sounding dose with a borrowed quote fails.
 */
export function supportedBySource(
  key: "doseOrRegimen" | "fundingOrCoi",
  field: StudyCard[CardFieldKey],
  source: { title: string; abstract: string },
): boolean {
  if (field.status !== "stated" || !field.quote || !field.value) return false;
  const text = `${source.title} ${source.abstract}`;
  const pattern = key === "doseOrRegimen" ? DOSE_WORDS : FUNDING_WORDS;
  if (!pattern.test(field.quote) && !pattern.test(field.value)) return false;
  return numbers(field.value).every((n) => quoteInText(text, n));
}

export interface UnknownDiscipline {
  /** Rarely-stated fields filled in without support (suspect, or an unsupported dose/funding). */
  guessed: CardFieldKey[];
  /** Dose or funding values the abstract does not back up. */
  doseFundingGuesses: CardFieldKey[];
  /** Rarely-stated fields the model left unknown. */
  leftUnknown: number;
  /** Share of the rarely-stated fields that are unknown or supported (1 = no guessing). */
  score: number;
}

/**
 * Unknown discipline: on the fields abstracts rarely state, did the model say "unknown" rather
 * than guess? A value counts as a guess when its quote fails the check, or, for dose and
 * funding, when the abstract doesn't contain it (`supportedBySource`).
 */
export function unknownDiscipline(
  card: StudyCard,
  source: { title: string; abstract: string },
): UnknownDiscipline {
  const guessed: CardFieldKey[] = [];
  const doseFundingGuesses: CardFieldKey[] = [];
  let leftUnknown = 0;
  for (const k of rarelyStatedFields) {
    const f = card[k];
    if (f.status === "unknown") {
      leftUnknown++;
      continue;
    }
    if (k === "doseOrRegimen" || k === "fundingOrCoi") {
      if (!supportedBySource(k, f, source)) {
        guessed.push(k);
        doseFundingGuesses.push(k);
      }
    } else if (f.status === "suspect") {
      guessed.push(k);
    }
  }
  return {
    guessed,
    doseFundingGuesses,
    leftUnknown,
    score: 1 - guessed.length / rarelyStatedFields.length,
  };
}

/** The facts a summary may use: verified fields only, as "Label: value" lines. */
export function verifiedFacts(card: StudyCard): { key: CardFieldKey; value: string }[] {
  return cardFieldKeys
    .filter((k) => card[k].status === "stated" && card[k].value)
    .map((k) => ({ key: k, value: card[k].value as string }));
}

export const judgeReplySchema = z.object({
  claims: z.array(z.object({ claim: z.string(), supported: z.boolean() })),
});
export type JudgeReply = z.infer<typeof judgeReplySchema>;

/**
 * Parses the judge's reply: a JSON object, possibly wrapped in a code fence or chatter.
 * Throws when there is no valid object.
 */
export function parseJudgeReply(text: string): JudgeReply {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end < start) throw new Error("Judge reply has no JSON object");
  return judgeReplySchema.parse(JSON.parse(text.slice(start, end + 1)));
}

/** Faithfulness: share of the summary's claims the judge found supported; null if no claims. */
export function faithfulness(reply: JudgeReply): {
  claims: number;
  unsupported: string[];
  score: number | null;
} {
  const unsupported = reply.claims.filter((c) => !c.supported).map((c) => c.claim);
  const claims = reply.claims.length;
  return { claims, unsupported, score: claims === 0 ? null : 1 - unsupported.length / claims };
}

export type FailureKind =
  | "timeout"
  | "invalid-json"
  | "rate-limit"
  | "server"
  | "vm-paused"
  | "other";

/** Sorts a failed model call by what went wrong. 429 and 5xx are worth retrying. */
export function classifyFailure(err: unknown): { kind: FailureKind; retryable: boolean } {
  const status =
    (err as { status?: number; statusCode?: number } | null)?.status ??
    (err as { statusCode?: number } | null)?.statusCode;
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof PausedError) return { kind: "vm-paused", retryable: true };
  if (status === 429 || /rate limit|\b429\b|resource.?exhausted|quota/i.test(message)) {
    return { kind: "rate-limit", retryable: true };
  }
  if (
    (err instanceof DOMException && err.name === "TimeoutError") ||
    /took longer|timed? ?out|aborted/i.test(message)
  ) {
    return { kind: "timeout", retryable: false };
  }
  if (
    /\b50[0-4]\b|unavailable|overloaded|internal error|high demand|try again later/i.test(message)
  ) {
    return { kind: "server", retryable: true };
  }
  if (/structured output|returned no card|json|validation|parse/i.test(message)) {
    return { kind: "invalid-json", retryable: false };
  }
  return { kind: "other", retryable: false };
}

/** A call that overlapped a pause of this machine; its outcome and latency mean nothing. */
export class PausedError extends Error {
  override name = "PausedError";
}

export interface PauseWatch {
  /** Gaps the ticker saw, as [from, to] wall-clock ms. */
  pauses: { from: number; to: number }[];
  /** Ticks now; call it when a call ends so a pause is seen before the ticker runs. */
  tick: () => void;
  /** Whether a pause overlapped [start, end]. */
  overlaps: (start: number, end: number) => boolean;
  stop: () => void;
}

/**
 * Detects pauses of the whole machine. The dev VM gets suspended by its host for ~16 minutes
 * at a time; timers (including abort timeouts) then fire late and in-flight calls die or report
 * the pause as latency. A ticker that sees a gap longer than `gapMs` records a pause.
 */
export function pauseWatch(gapMs = 10_000, tickMs = 1_000, now = Date.now): PauseWatch {
  const pauses: { from: number; to: number }[] = [];
  let last = now();
  const tick = () => {
    const t = now();
    if (t - last > gapMs) pauses.push({ from: last, to: t });
    last = t;
  };
  const timer = setInterval(tick, tickMs);
  timer.unref();
  return {
    pauses,
    tick,
    overlaps: (start, end) => pauses.some((p) => p.from < end && p.to > start),
    stop: () => clearInterval(timer),
  };
}

export class DeadlineError extends Error {
  override name = "DeadlineError";
}

/**
 * Runs `fn` with a wall-clock deadline of `hardMs`. Needed because in Mastra 1.74 the
 * `abortSignal` neither throws (an aborted `generate` resolves with an empty result, which
 * the card agent reports as "returned no card") nor reliably stops a call: some ran for 16
 * minutes. So a failure after `softMs` (the agent's own abort timeout) also counts as a
 * timeout. A call that hits `hardMs` is abandoned, not cancelled.
 */
export async function withDeadline<T>(
  fn: () => Promise<T>,
  opts: { hardMs: number; softMs: number },
): Promise<T> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new DeadlineError(`timed out after ${opts.hardMs / 1000} s (abandoned)`)),
      opts.hardMs,
    );
  });
  try {
    return await Promise.race([fn(), deadline]);
  } catch (err) {
    const elapsed = Date.now() - started;
    if (!(err instanceof DeadlineError) && elapsed >= opts.softMs) {
      const message = err instanceof Error ? err.message : String(err);
      throw new DeadlineError(`timed out after ${Math.round(elapsed / 1000)} s (${message})`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Exponential backoff with jitter: base·2^attempt, ±25 %. */
export function backoffMs(attempt: number, baseMs: number, random = Math.random): number {
  return Math.round(baseMs * 2 ** attempt * (0.75 + random() * 0.5));
}

export interface RetryStats {
  attempts: number;
  rateLimited: number;
  serverErrors: number;
  /** Calls lost to a pause of this machine (see `pauseWatch`). */
  paused?: number;
}

/**
 * Runs `fn`, retrying 429s and 5xx with exponential backoff, up to `maxAttempts` calls.
 * `stats` is filled in as it goes, so the caller sees the counts even when it finally throws.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  stats: RetryStats,
  opts: { maxAttempts?: number; baseMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const { maxAttempts = 5, baseMs = 5_000 } = opts;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    stats.attempts++;
    try {
      return await fn();
    } catch (err) {
      const { kind, retryable } = classifyFailure(err);
      if (kind === "rate-limit") stats.rateLimited++;
      if (kind === "server") stats.serverErrors++;
      if (kind === "vm-paused") stats.paused = (stats.paused ?? 0) + 1;
      if (!retryable || attempt + 1 >= maxAttempts) throw err;
      await sleep(backoffMs(attempt, baseMs));
    }
  }
}

/** A counting semaphore: at most `limit` callers run `fn` at once. */
export function limiter(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= limit) await new Promise<void>((r) => waiting.push(r));
    else active++;
    try {
      return await fn();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

/** One (model, paper) result: a CSV row. */
export interface BenchRow {
  model: string;
  paperId: number;
  title: string;
  ok: boolean;
  failure: FailureKind | "";
  error: string;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  attempts: number;
  rateLimited: number;
  given: number | null;
  stated: number | null;
  suspect: number | null;
  unknown: number | null;
  quoteCheckRate: number | null;
  rarelyStatedGuesses: string;
  doseFundingGuesses: string;
  unknownDiscipline: number | null;
  judgeModel: string;
  claims: number | null;
  unsupportedClaims: number | null;
  faithfulness: number | null;
  judgeLatencyMs: number | null;
  judgeError: string;
}

export const csvColumns: (keyof BenchRow)[] = [
  "model",
  "paperId",
  "title",
  "ok",
  "failure",
  "error",
  "latencyMs",
  "inputTokens",
  "outputTokens",
  "attempts",
  "rateLimited",
  "given",
  "stated",
  "suspect",
  "unknown",
  "quoteCheckRate",
  "rarelyStatedGuesses",
  "doseFundingGuesses",
  "unknownDiscipline",
  "judgeModel",
  "claims",
  "unsupportedClaims",
  "faithfulness",
  "judgeLatencyMs",
  "judgeError",
];

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" && !Number.isInteger(v) ? v.toFixed(3) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: BenchRow[]): string {
  const lines = [csvColumns.join(",")];
  for (const r of rows) lines.push(csvColumns.map((c) => csvCell(r[c])).join(","));
  return `${lines.join("\n")}\n`;
}

export interface ModelSummary {
  model: string;
  papers: number;
  ok: number;
  failures: Partial<Record<FailureKind, number>>;
  /** Pooled over all values the model gave. */
  quoteCheckRate: number | null;
  /** Mean per-card unknown-discipline score. */
  unknownDiscipline: number | null;
  doseFundingGuesses: number;
  /** Pooled over all judged claims. */
  faithfulness: number | null;
  judgedCards: number;
  medianLatencyMs: number | null;
  maxLatencyMs: number | null;
  meanInputTokens: number | null;
  meanOutputTokens: number | null;
  rateLimited: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  const hi = s[m] as number;
  return s.length % 2 ? hi : ((s[m - 1] as number) + hi) / 2;
}
const present = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null);

/** Per-model summary over its rows. */
export function summarise(model: string, rows: BenchRow[]): ModelSummary {
  const mine = rows.filter((r) => r.model === model);
  const ok = mine.filter((r) => r.ok);
  const failures: Partial<Record<FailureKind, number>> = {};
  for (const r of mine) if (r.failure) failures[r.failure] = (failures[r.failure] ?? 0) + 1;
  const given = ok.reduce((a, r) => a + (r.given ?? 0), 0);
  const stated = ok.reduce((a, r) => a + (r.stated ?? 0), 0);
  const judged = ok.filter((r) => r.claims !== null && r.claims > 0);
  const claims = judged.reduce((a, r) => a + (r.claims ?? 0), 0);
  const unsupported = judged.reduce((a, r) => a + (r.unsupportedClaims ?? 0), 0);
  const latencies = present(ok.map((r) => r.latencyMs));
  return {
    model,
    papers: mine.length,
    ok: ok.length,
    failures,
    quoteCheckRate: given ? stated / given : null,
    unknownDiscipline: mean(present(ok.map((r) => r.unknownDiscipline))),
    doseFundingGuesses: ok.reduce(
      (a, r) => a + (r.doseFundingGuesses ? r.doseFundingGuesses.split(";").length : 0),
      0,
    ),
    faithfulness: claims ? 1 - unsupported / claims : null,
    judgedCards: judged.length,
    medianLatencyMs: median(latencies),
    maxLatencyMs: latencies.length ? Math.max(...latencies) : null,
    meanInputTokens: mean(present(ok.map((r) => r.inputTokens))),
    meanOutputTokens: mean(present(ok.map((r) => r.outputTokens))),
    rateLimited: mine.reduce((a, r) => a + r.rateLimited, 0),
  };
}

const pct = (x: number | null) => (x === null ? "n/a" : `${Math.round(x * 100)}%`);
const secs = (ms: number | null) => (ms === null ? "n/a" : `${(ms / 1000).toFixed(1)} s`);
const int = (x: number | null) => (x === null ? "n/a" : String(Math.round(x)));

/** The summary as a markdown table, one column per model. */
export function summaryTable(summaries: ModelSummary[], judges: Record<string, string>): string {
  const short = (m: string) => m.replace(/^google\//, "");
  const failures = (s: ModelSummary) => {
    const parts = Object.entries(s.failures).map(([k, n]) => `${n} ${k}`);
    return parts.length ? parts.join(", ") : "0";
  };
  const rows: [string, (s: ModelSummary) => string][] = [
    ["Cards generated", (s) => `${s.ok} / ${s.papers}`],
    ["Failures", failures],
    ["Quote check rate (verified / values given)", (s) => pct(s.quoteCheckRate)],
    ["Unknown discipline (rarely-stated fields not guessed)", (s) => pct(s.unknownDiscipline)],
    ["Unsupported dose / funding values", (s) => String(s.doseFundingGuesses)],
    [
      "Summary faithfulness (claims supported)",
      (s) => `${pct(s.faithfulness)} (${s.judgedCards} cards)`,
    ],
    ["Judged by", (s) => short(judges[s.model] ?? "n/a")],
    ["Median latency", (s) => secs(s.medianLatencyMs)],
    ["Max latency", (s) => secs(s.maxLatencyMs)],
    ["Mean input / output tokens", (s) => `${int(s.meanInputTokens)} / ${int(s.meanOutputTokens)}`],
    ["429 responses (retried)", (s) => String(s.rateLimited)],
  ];
  const header = `| Metric | ${summaries.map((s) => short(s.model)).join(" | ")} |`;
  const sep = `|---|${summaries.map(() => "---").join("|")}|`;
  const body = rows.map(([label, f]) => `| ${label} | ${summaries.map(f).join(" | ")} |`);
  return [header, sep, ...body].join("\n");
}
