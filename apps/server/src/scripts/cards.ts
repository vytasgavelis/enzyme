/**
 * Generates study cards for papers in the local database and prints them, for checking the
 * model by eye (T-7) and comparing models (EN-38). Cards are stored like the API stores them.
 *
 *   pnpm cards <paperId>... [--model google/gemma-4-31b-it] [--quiet]
 */
import { parseArgs } from "node:util";
import { cardFieldKeys, cardFields, checkCard } from "@enzyme/shared";
import { eq } from "drizzle-orm";
import { createCardGenerator, DEFAULT_MODEL } from "../ai/card-agent.js";
import { insertCard } from "../db/cards.js";
import { db, runMigrations } from "../db/index.js";
import { papers } from "../db/schema.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { model: { type: "string" }, quiet: { type: "boolean", default: false } },
});
const model = values.model ?? (process.env.ENZYME_MODEL || DEFAULT_MODEL);
const generate = createCardGenerator(model);
runMigrations();

const MARK = { stated: "✓", unknown: "·", suspect: "✗" } as const;

for (const id of positionals.map(Number)) {
  const p = db
    .select({ title: papers.titleText, abstract: papers.abstractText })
    .from(papers)
    .where(eq(papers.id, id))
    .get();
  if (!p?.abstract) {
    console.log(`#${id}: no such paper or no abstract`);
    continue;
  }
  try {
    const source = { title: p.title ?? "", abstract: p.abstract };
    const gen = await generate(source);
    const card = checkCard(gen.output, source);
    insertCard(db, { paperId: id, ...gen, card });
    console.log(
      `\n#${id} ${p.title}\n  ${gen.modelId} ${gen.latencyMs}ms in=${gen.inputTokens} out=${gen.outputTokens}`,
    );
    if (!values.quiet) console.log(`\n  ${p.abstract}\n`);
    for (const k of cardFieldKeys) {
      const f = card[k];
      const line = `  ${MARK[f.status]} ${cardFields[k].label}: ${f.value ?? "unknown"}`;
      console.log(f.quote ? `${line}\n      "${f.quote}"` : line);
    }
    console.log(`  takeaway: ${card.takeaway}\n  summary: ${card.plainSummary}`);
  } catch (err) {
    console.log(`#${id}: ${err instanceof Error ? err.message : err}`);
  }
}
