import { feedQuerySchema, savedSearchInputSchema } from "@enzyme/shared";
import { Hono } from "hono";
import { z } from "zod";
import { getFeed } from "../db/feed.js";
import {
  createSearch,
  deleteSearch,
  getSearchRow,
  latestRun,
  listSearches,
  markViewed,
  type SearchFields,
  updateSearch,
} from "../db/searches.js";
import { type PullDeps, startPull } from "../pull.js";
import { buildQuery, EuropePmcError } from "../sources/europepmc.js";
import { validate } from "./validate.js";

export interface SearchesRouteDeps extends PullDeps {
  /** Called with each started pull's completion promise; tests use it to wait for pulls. */
  onPullStarted?: (done: Promise<void>) => void;
}

const idParam = validate("param", z.object({ id: z.coerce.number().int().positive() }));

/**
 * An empty query means "use the name". Rejects queries Europe PMC would refuse (too long once
 * the abstract filter is added) with the message the client shows.
 */
function toFields(input: z.output<typeof savedSearchInputSchema>): SearchFields | string {
  const fields = { name: input.name, query: input.query || input.name };
  try {
    buildQuery(fields.query);
  } catch (err) {
    if (err instanceof EuropePmcError) return err.message;
    throw err;
  }
  return fields;
}

/** Saved searches (EN-1), pulls (EN-3, EN-22) and each search's feed (EN-9, EN-19, EN-21). */
export function searchesRoute(deps: SearchesRouteDeps) {
  const { db } = deps;
  const notFound = { error: "Search not found" } as const;

  return new Hono()
    .get("/", (c) => c.json(listSearches(db)))
    .post("/", validate("json", savedSearchInputSchema), (c) => {
      const fields = toFields(c.req.valid("json"));
      if (typeof fields === "string") return c.json({ error: fields }, 400);
      return c.json(createSearch(db, fields), 201);
    })
    .put("/:id", idParam, validate("json", savedSearchInputSchema), (c) => {
      const fields = toFields(c.req.valid("json"));
      if (typeof fields === "string") return c.json({ error: fields }, 400);
      const search = updateSearch(db, c.req.valid("param").id, fields);
      return search ? c.json(search, 200) : c.json(notFound, 404);
    })
    .delete("/:id", idParam, (c) =>
      deleteSearch(db, c.req.valid("param").id) ? c.body(null, 204) : c.json(notFound, 404),
    )
    .post("/:id/viewed", idParam, (c) => {
      const result = markViewed(db, c.req.valid("param").id);
      return result ? c.json(result, 200) : c.json(notFound, 404);
    })
    .post("/:id/pull", idParam, (c) => {
      const search = getSearchRow(db, c.req.valid("param").id);
      if (!search) return c.json(notFound, 404);
      const { run, done } = startPull(deps, search);
      deps.onPullStarted?.(done);
      return c.json(run, 202);
    })
    .get("/:id/pull", idParam, (c) => {
      const { id } = c.req.valid("param");
      if (!getSearchRow(db, id)) return c.json(notFound, 404);
      return c.json(latestRun(db, id), 200);
    })
    .get("/:id/papers", idParam, validate("query", feedQuerySchema), (c) => {
      const { id } = c.req.valid("param");
      if (!getSearchRow(db, id)) return c.json(notFound, 404);
      return c.json(getFeed(db, id, c.req.valid("query")), 200);
    });
}
