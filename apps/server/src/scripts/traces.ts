/**
 * Print recent Mastra traces (T-13) from the local trace store, one tree per agent run:
 * model calls with tokens and latency, tool calls with input and output.
 *
 *   pnpm traces                 last 5 runs
 *   pnpm traces --limit 20
 *   pnpm traces --agent query-writer --full   untruncated input/output
 */
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import Database from "better-sqlite3";
import { repoRoot } from "../db/index.js";

const { values } = parseArgs({
  options: {
    limit: { type: "string", default: "5" },
    agent: { type: "string" },
    full: { type: "boolean", default: false },
  },
});

const path = resolve(repoRoot, process.env.TRACES_PATH ?? "data/mastra.db");
const db = new Database(path, { readonly: true, fileMustExist: true });

interface Span {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  spanType: string;
  startedAt: string;
  endedAt: string | null;
  attributes: string | null;
  input: string | null;
  output: string | null;
  error: string | null;
}

// Mastra's libsql store keeps these columns as SQLite JSONB; json() turns them back into text.
const runs = db
  .prepare<{ agent: string | null; limit: number }, Span>(
    `SELECT traceId, spanId, parentSpanId, name, spanType, startedAt, endedAt,
            json(attributes) AS attributes, json(input) AS input, json(output) AS output,
            json(error) AS error
       FROM mastra_ai_spans
      WHERE spanType = 'agent_run' AND (@agent IS NULL OR entityId = @agent)
      ORDER BY startedAt DESC LIMIT @limit`,
  )
  .all({ agent: values.agent ?? null, limit: Number(values.limit) });

const spansOf = db.prepare<[string], Span>(
  `SELECT traceId, spanId, parentSpanId, name, spanType, startedAt, endedAt,
          json(attributes) AS attributes, json(input) AS input, json(output) AS output,
          json(error) AS error
     FROM mastra_ai_spans
    WHERE traceId = ? AND spanType IN ('agent_run', 'model_generation', 'tool_call')
    ORDER BY startedAt`,
);

const ms = (s: Span) =>
  s.endedAt ? `${new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()} ms` : "running";
const clip = (text: string | null, n = 160) => {
  if (!text) return "";
  const flat = text.replace(/\s+/g, " ");
  return values.full || flat.length <= n ? flat : `${flat.slice(0, n)}…`;
};
const parse = (text: string | null) => {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
};

for (const run of runs.reverse()) {
  console.log(`\n${run.startedAt}  ${run.name}  ${ms(run)}  trace ${run.traceId}`);
  for (const span of spansOf.all(run.traceId)) {
    if (span.spanType === "model_generation") {
      const usage = parse(span.attributes)?.usage ?? {};
      console.log(
        `  model ${span.name}  ${ms(span)}  in=${usage.inputTokens ?? "?"} out=${usage.outputTokens ?? "?"}`,
      );
    } else if (span.spanType === "tool_call") {
      console.log(`  tool ${span.name}  ${ms(span)}`);
      console.log(`    in:  ${clip(span.input)}`);
      console.log(`    out: ${clip(span.output)}`);
    } else if (span.spanId === run.spanId) {
      console.log(`  input:  ${clip(span.input, 200)}`);
      console.log(`  output: ${clip(span.output, 300)}`);
    }
    if (span.error) console.log(`    error: ${clip(span.error)}`);
  }
}
