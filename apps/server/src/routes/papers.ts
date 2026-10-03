import { checkCard, type PaperCard } from "@enzyme/shared";
import { desc, eq, getTableColumns } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { type GenerateCard, ModelError } from "../ai/card-agent.js";
import { insertCard, latestCard } from "../db/cards.js";
import type { Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { validate } from "./validate.js";

/** Everything except the raw source record and the FTS-only plain-text copies. */
const {
  raw: _raw,
  titleText: _t,
  abstractText: _a,
  ...paperColumns
} = getTableColumns(schema.papers);

export interface PapersRouteDeps {
  db: Db;
  generateCard: GenerateCard;
  /** Where the per-call model log goes (latency, tokens); tests silence it. */
  log?: (line: string) => void;
}

const idParam = validate("param", z.object({ id: z.coerce.number().int().positive() }));

/** Paper lookups and study cards (T-7). Papers arrive via pulls (T-4). */
export function papersRoute({ db, generateCard, log = console.log }: PapersRouteDeps) {
  const notFound = { error: "Paper not found" } as const;
  /** One model call per paper at a time; a second request joins the first. */
  const inFlight = new Map<number, Promise<PaperCard>>();

  async function generate(paperId: number, title: string, abstract: string) {
    const gen = await generateCard({ title, abstract });
    const card = checkCard(gen.output, { title, abstract });
    const suspect = Object.values(card).filter(
      (f) => typeof f === "object" && f?.status === "suspect",
    ).length;
    log(
      `card paper=${paperId} model=${gen.modelId} ${gen.latencyMs}ms in=${gen.inputTokens} out=${gen.outputTokens} suspect=${suspect}`,
    );
    return insertCard(db, { paperId, ...gen, card });
  }

  return new Hono()
    .get("/", async (c) => {
      const rows = await db
        .select(paperColumns)
        .from(schema.papers)
        .orderBy(desc(schema.papers.firstSeenAt))
        .limit(100);
      return c.json(rows);
    })
    .get("/:id", idParam, async (c) => {
      const { id } = c.req.valid("param");
      const [row] = await db
        .select(paperColumns)
        .from(schema.papers)
        .where(eq(schema.papers.id, id));
      if (!row) return c.json(notFound, 404);
      return c.json(row, 200);
    })
    .get("/:id/card", idParam, (c) => {
      const card = latestCard(db, c.req.valid("param").id);
      return card ? c.json(card, 200) : c.json({ error: "No card yet" }, 404);
    })
    .post("/:id/card", idParam, async (c) => {
      const { id } = c.req.valid("param");
      const paper = db
        .select({ titleText: schema.papers.titleText, abstractText: schema.papers.abstractText })
        .from(schema.papers)
        .where(eq(schema.papers.id, id))
        .get();
      if (!paper) return c.json(notFound, 404);
      if (!paper.abstractText) {
        return c.json({ error: "This paper has no abstract to summarise." }, 422);
      }
      let call = inFlight.get(id);
      if (!call) {
        call = generate(id, paper.titleText ?? "", paper.abstractText).finally(() =>
          inFlight.delete(id),
        );
        inFlight.set(id, call);
      }
      try {
        return c.json(await call, 201);
      } catch (err) {
        if (!(err instanceof ModelError)) throw err;
        log(`card paper=${id} failed: ${err.message}`);
        return c.json({ error: err.message }, err.status);
      }
    });
}
