/**
 * Model benchmark (T-12, EN-38): generates a study card for each paper with each model, scores
 * the cards with the Mastra scorers in `bench/scorers.ts`, and writes a CSV (one row per model
 * and paper), a JSON file with the cards and judge verdicts, and a markdown summary.
 * Nothing is written to the database: the cards the app shows are left alone.
 *
 *   pnpm bench [paperId...] [--models a,b] [--name run-name] [--out-dir dir] [--concurrency 2]
 *
 * Each model's summaries are judged by the next model in `--models` (so with two models, each
 * judges the other). At most `--concurrency` model calls run at once, judge calls included;
 * 429s and 5xx are retried with backoff. A call still running after 150 s is abandoned (Mastra
 * does not reliably cancel it) and frees its slot.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { checkCard, type StudyCard } from "@enzyme/shared";
import { eq } from "drizzle-orm";
import { createCardGenerator } from "../ai/card-agent.js";
import { createJudge, type Judge } from "../bench/judge.js";
import {
  createFaithfulnessScorer,
  quoteCheckScorer,
  unknownDisciplineScorer,
} from "../bench/scorers.js";
import {
  type BenchRow,
  classifyFailure,
  limiter,
  PausedError,
  pauseWatch,
  type RetryStats,
  summarise,
  summaryTable,
  toCsv,
  withDeadline,
  withRetry,
} from "../bench/scores.js";
import { db } from "../db/index.js";
import { papers } from "../db/schema.js";

/**
 * Default papers: primary studies with abstracts on her topics (anti-inflammatory, autoimmune,
 * gut health), mixing human trials, observational studies and animal work.
 */
const DEFAULT_PAPERS = [79, 93, 181, 253, 676, 692, 705, 1041, 1192, 1221, 1273, 1425];
const DEFAULT_MODELS = ["google/gemma-4-26b-a4b-it", "google/gemma-4-31b-it"];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    models: { type: "string" },
    name: { type: "string" },
    "out-dir": { type: "string" },
    concurrency: { type: "string", default: "2" },
  },
});
const models = values.models?.split(",").map((m) => m.trim()) ?? DEFAULT_MODELS;
const paperIds = positionals.length ? positionals.map(Number) : DEFAULT_PAPERS;
const name = values.name ?? `cards-${new Date().toISOString().slice(0, 10)}`;
const outDir = resolve(repoRoot, values["out-dir"] ?? "bench/results");
const slot = limiter(Number(values.concurrency));

/** The model that judges `model`'s summaries: the next one in the list. */
const judgeOf = (model: string) => models[(models.indexOf(model) + 1) % models.length] ?? model;
const judges: Record<string, string> = Object.fromEntries(models.map((m) => [m, judgeOf(m)]));
if (models.some((m) => judges[m] === m)) {
  console.warn("Only one model: it will judge its own summaries.");
}

const sources = paperIds.map((id) => {
  const p = db
    .select({ title: papers.titleText, abstract: papers.abstractText })
    .from(papers)
    .where(eq(papers.id, id))
    .get();
  if (!p?.abstract) throw new Error(`Paper ${id} not found or has no abstract`);
  return { id, title: p.title ?? "", abstract: p.abstract };
});

/** Both agents abort at 90 s; a call that ends after 85 s is a timeout, after 150 s it is abandoned. */
const DEADLINE = { softMs: 85_000, hardMs: 150_000 };
const watch = pauseWatch();

/** One model call: deadline, and a PausedError (retried) if this machine paused meanwhile. */
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const pausedSince = () => {
    watch.tick();
    return watch.overlaps(start, Date.now());
  };
  let result: T;
  try {
    result = await withDeadline(fn, DEADLINE);
  } catch (err) {
    if (pausedSince()) throw new PausedError(`machine paused during the call (${err})`);
    throw err;
  }
  if (pausedSince()) throw new PausedError("machine paused during the call");
  return result;
}

/** A judge that waits for a model slot, has a deadline and retries 429/5xx into `stats`. */
function slottedJudge(judge: Judge, stats: RetryStats): Judge {
  return (input) => slot(() => withRetry(() => guarded(() => judge(input)), stats));
}

const generators = new Map(models.map((m) => [m, createCardGenerator(m)]));
const judgeAgents = new Map(models.map((m) => [m, createJudge(m)]));
const need = <T>(x: T | undefined): T => {
  if (x === undefined) throw new Error("unreachable: unknown model");
  return x;
};

interface Detail {
  model: string;
  paperId: number;
  card: StudyCard | null;
  reasons: Record<string, string>;
  unsupportedClaims: string[];
}

async function benchOne(model: string, paper: (typeof sources)[number]) {
  const row: BenchRow = {
    model,
    paperId: paper.id,
    title: paper.title.slice(0, 80),
    ok: false,
    failure: "",
    error: "",
    latencyMs: null,
    inputTokens: null,
    outputTokens: null,
    attempts: 0,
    rateLimited: 0,
    given: null,
    stated: null,
    suspect: null,
    unknown: null,
    quoteCheckRate: null,
    rarelyStatedGuesses: "",
    doseFundingGuesses: "",
    unknownDiscipline: null,
    judgeModel: judgeOf(model),
    claims: null,
    unsupportedClaims: null,
    faithfulness: null,
    judgeLatencyMs: null,
    judgeError: "",
  };
  const detail: Detail = {
    model,
    paperId: paper.id,
    card: null,
    reasons: {},
    unsupportedClaims: [],
  };
  const stats: RetryStats = { attempts: 0, rateLimited: 0, serverErrors: 0 };
  const source = { title: paper.title, abstract: paper.abstract };
  const tag = `${model.replace(/^google\//, "")} #${paper.id}`;

  try {
    const generate = need(generators.get(model));
    const gen = await slot(() => withRetry(() => guarded(() => generate(source)), stats));
    Object.assign(row, {
      ok: true,
      latencyMs: gen.latencyMs,
      inputTokens: gen.inputTokens,
      outputTokens: gen.outputTokens,
    });
    detail.card = checkCard(gen.output, source);
  } catch (err) {
    row.failure = classifyFailure(err).kind;
    row.error = err instanceof Error ? err.message : String(err);
  }
  row.attempts = stats.attempts;
  row.rateLimited = stats.rateLimited;
  if (!detail.card) {
    console.log(`${tag}: FAILED (${row.failure}) ${row.error}`);
    return { row, detail };
  }

  const run = { input: source, output: { card: detail.card } };
  const q = await quoteCheckScorer.run(run);
  const u = await unknownDisciplineScorer.run(run);
  Object.assign(row, {
    given: q.preprocessStepResult?.given ?? null,
    stated: q.preprocessStepResult?.stated ?? null,
    suspect: q.preprocessStepResult?.suspect ?? null,
    unknown: q.preprocessStepResult?.unknown ?? null,
    quoteCheckRate: q.score ?? null,
    unknownDiscipline: u.score ?? null,
    rarelyStatedGuesses: u.preprocessStepResult?.guessed.join(";") ?? "",
    doseFundingGuesses: u.preprocessStepResult?.doseFundingGuesses.join(";") ?? "",
  });
  detail.reasons["quote-check-rate"] = String(q.reason ?? "");
  detail.reasons["unknown-discipline"] = String(u.reason ?? "");

  const judgeStats: RetryStats = { attempts: 0, rateLimited: 0, serverErrors: 0 };
  const faithful = createFaithfulnessScorer(
    slottedJudge(need(judgeAgents.get(judgeOf(model))), judgeStats),
  );
  const f = await faithful.run(run);
  const a = f.analyzeStepResult;
  if (a?.error) {
    row.judgeError = a.error;
  } else if (a?.judgement) {
    row.claims = a.claims ?? null;
    row.unsupportedClaims = a.unsupported?.length ?? null;
    row.faithfulness = f.score ?? null;
    row.judgeLatencyMs = a.judgement.latencyMs;
    detail.unsupportedClaims = a.unsupported ?? [];
  }
  detail.reasons["summary-faithfulness"] = String(f.reason ?? "");
  row.rateLimited += judgeStats.rateLimited;

  console.log(
    `${tag}: ${row.latencyMs} ms, quotes ${row.stated}/${row.given}, guesses [${row.rarelyStatedGuesses}], ` +
      `faithful ${row.claims === null ? `n/a ${row.judgeError}` : `${row.claims - (row.unsupportedClaims ?? 0)}/${row.claims}`}`,
  );
  return { row, detail };
}

mkdirSync(outDir, { recursive: true });
const csvPath = resolve(outDir, `${name}.csv`);
const jsonPath = resolve(outDir, `${name}.json`);
const mdPath = resolve(outDir, `${name}.md`);
/** One line per finished (model, paper), appended as it finishes, so a rerun resumes. */
const journalPath = resolve(outDir, `${name}.jsonl`);

type Result = Awaited<ReturnType<typeof benchOne>>;
const key = (model: string, paperId: number) => `${model}#${paperId}`;
const done = new Map<string, Result>();
if (existsSync(journalPath)) {
  for (const line of readFileSync(journalPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as Result;
    // A call lost to a machine pause says nothing about the model: run it again. The judge
    // reports its pauses in judgeError, not failure.
    const paused = r.row.failure === "vm-paused" || r.row.judgeError.startsWith("machine paused");
    if (!paused) done.set(key(r.row.model, r.row.paperId), r);
  }
}

const started = Date.now();
const todo = sources.flatMap((p) =>
  models.filter((m) => !done.has(key(m, p.id))).map((m) => ({ m, p })),
);
console.log(
  `Benchmark "${name}": ${models.join(", ")} over ${paperIds.length} papers (${paperIds.join(", ")}); ` +
    `${done.size} rows already in ${relative(repoRoot, journalPath)}, ${todo.length} to run`,
);
// Paper by paper (both models on a paper before the next), so a partial run still compares.
const jobSlot = limiter(Number(values.concurrency));
await Promise.all(
  todo.map(({ m, p }) =>
    jobSlot(async () => {
      const r = await benchOne(m, p);
      appendFileSync(journalPath, `${JSON.stringify(r)}\n`);
      done.set(key(m, p.id), r);
    }),
  ),
);
const results = sources.flatMap((p) =>
  models.flatMap((m) => {
    const r = done.get(key(m, p.id));
    return r ? [r] : [];
  }),
);
const wallMs = Date.now() - started;
watch.stop();
const pausedMs = watch.pauses.reduce((a, p) => a + p.to - p.from, 0);
const pauseNote = watch.pauses.length
  ? ` This machine was paused ${watch.pauses.length} times (${(pausedMs / 1000).toFixed(0)} s in all); calls caught in a pause were retried.`
  : "";

const rows = results.map((r) => r.row);
const summaries = models.map((m) => summarise(m, rows));
const table = summaryTable(summaries, judges);
const judgeLines = models.map((m) => `- \`${m}\` cards were judged by \`${judges[m]}\`.`);

const PLACEHOLDER = "_(fill in after reading the numbers)_";
const previous = existsSync(mdPath)
  ? readFileSync(mdPath, "utf8").split("## Conclusions\n")[1]
  : "";
const conclusions = previous?.trim() || PLACEHOLDER;

writeFileSync(csvPath, toCsv(rows));
writeFileSync(
  jsonPath,
  `${JSON.stringify({ name, models, judges, paperIds, wallMs, summaries, details: results.map((r) => r.detail) }, null, 2)}\n`,
);
writeFileSync(
  mdPath,
  `# Model benchmark: ${name}

Study cards for ${paperIds.length} papers (ids ${paperIds.join(", ")}), generated by each model with the
same prompt (\`createCardGenerator\`), scored with Mastra scorers (\`apps/server/src/bench/scorers.ts\`).
Wall time of the last session ${(wallMs / 1000).toFixed(0)} s with at most ${values.concurrency} model calls at once.${pauseNote}
Per-card rows: \`${relative(repoRoot, csvPath)}\`; cards and judge verdicts: \`${relative(repoRoot, jsonPath)}\`.

${table}

Summary faithfulness is an LLM judge; no model judges its own cards:
${judgeLines.join("\n")}

How the scores work:
- **Quote check rate**: of the fields the model filled in, the share whose quote \`checkCard\` found verbatim in the title or abstract.
- **Unknown discipline**: of the five fields abstracts rarely state (comparator, dose, duration, limitations, funding), the share the model either left unknown or backed with a verified quote. A dose or funding value also counts as a guess when the quote isn't a dose or funding statement, or a number in the value isn't in the abstract.
- **Summary faithfulness**: the judge splits the takeaway and plain summary into claims and marks each as supported by the verified facts or not; the score pools all claims.

## Conclusions

${conclusions}
`,
);

console.log(`\n${table}\n\n${judgeLines.join("\n")}`);
console.log(
  `\nWall time ${(wallMs / 1000).toFixed(0)} s.${pauseNote} Wrote ${relative(repoRoot, csvPath)}, .json, .md`,
);
