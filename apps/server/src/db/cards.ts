import type { PaperCard, StudyCard } from "@enzyme/shared";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./client.js";
import { type CardRow, cards } from "./schema.js";

const toPaperCard = (r: CardRow): PaperCard => ({
  paperId: r.paperId,
  modelId: r.modelId,
  createdAt: r.createdAt.toISOString(),
  latencyMs: r.latencyMs,
  inputTokens: r.inputTokens,
  outputTokens: r.outputTokens,
  card: r.card,
});

export function insertCard(
  db: Db,
  row: {
    paperId: number;
    modelId: string;
    card: StudyCard;
    latencyMs: number;
    inputTokens: number | null;
    outputTokens: number | null;
  },
): PaperCard {
  return toPaperCard(db.insert(cards).values(row).returning().get());
}

/** The paper's current card: the newest one (ids only grow). */
export function latestCard(db: Db, paperId: number): PaperCard | null {
  const row = db
    .select()
    .from(cards)
    .where(eq(cards.paperId, paperId))
    .orderBy(desc(cards.id))
    .limit(1)
    .get();
  return row ? toPaperCard(row) : null;
}

/** Current cards for a page of papers, keyed by paper id. */
export function latestCards(db: Db, paperIds: number[]): Map<number, PaperCard> {
  if (paperIds.length === 0) return new Map();
  const newest = db
    .select({ id: sql<number>`max(${cards.id})`.as("id") })
    .from(cards)
    .where(inArray(cards.paperId, paperIds))
    .groupBy(cards.paperId);
  const rows = db
    .select()
    .from(cards)
    .where(and(inArray(cards.paperId, paperIds), inArray(cards.id, newest)))
    .all();
  return new Map(rows.map((r) => [r.paperId, toPaperCard(r)]));
}
