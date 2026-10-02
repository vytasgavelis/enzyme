import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Placeholder table. Replace with the real data model after feature analysis.
 * Note: the FTS5 virtual table lives in a hand-written migration, not here —
 * Drizzle does not model virtual tables.
 */
export const papers = sqliteTable("papers", {
  pmid: text("pmid").primaryKey(),
  title: text("title").notNull(),
  abstract: text("abstract"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export type Paper = typeof papers.$inferSelect;
export type NewPaper = typeof papers.$inferInsert;
