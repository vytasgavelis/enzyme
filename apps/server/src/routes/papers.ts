import { paperInputSchema } from "@enzyme/shared";
import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db/index.js";

export const papersRoute = new Hono()
  .get("/", async (c) => {
    const rows = await db.select().from(schema.papers).orderBy(desc(schema.papers.createdAt));
    return c.json(rows);
  })
  .get("/:pmid", async (c) => {
    const pmid = c.req.param("pmid");
    const [row] = await db.select().from(schema.papers).where(eq(schema.papers.pmid, pmid));
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json(row);
  })
  .post("/", zValidator("json", paperInputSchema), async (c) => {
    const input = c.req.valid("json");
    const [row] = await db
      .insert(schema.papers)
      .values(input)
      .onConflictDoUpdate({
        target: schema.papers.pmid,
        set: { title: input.title, abstract: input.abstract },
      })
      .returning();
    return c.json(row, 201);
  });
