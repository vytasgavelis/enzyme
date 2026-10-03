import { zValidator } from "@hono/zod-validator";
import { desc, eq, getTableColumns } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../db/client.js";
import * as schema from "../db/schema.js";

/** Everything except the raw source record and the FTS-only plain-text copies. */
const {
  raw: _raw,
  titleText: _t,
  abstractText: _a,
  ...paperColumns
} = getTableColumns(schema.papers);

/** Placeholder read-only routes; T-5's feed API replaces the list. Papers arrive via pulls (T-4). */
export const papersRoute = (db: Db) =>
  new Hono()
    .get("/", async (c) => {
      const rows = await db
        .select(paperColumns)
        .from(schema.papers)
        .orderBy(desc(schema.papers.firstSeenAt))
        .limit(100);
      return c.json(rows);
    })
    .get("/:id", zValidator("param", z.object({ id: z.coerce.number().int() })), async (c) => {
      const { id } = c.req.valid("param");
      const [row] = await db
        .select(paperColumns)
        .from(schema.papers)
        .where(eq(schema.papers.id, id));
      if (!row) return c.json({ error: "not found" }, 404);
      return c.json(row);
    });
