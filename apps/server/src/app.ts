import { Hono } from "hono";
import { logger } from "hono/logger";
import { papersRoute } from "./routes/papers.js";
import { type SearchesRouteDeps, searchesRoute } from "./routes/searches.js";

export interface AppDeps extends SearchesRouteDeps {
  /** Log each request. Default `true`; tests turn it off. */
  logRequests?: boolean;
}

/** Builds the API on the given database and Europe PMC client (tests pass in-memory fakes). */
export function createApp(deps: AppDeps) {
  // Chain every route here. `AppType` is what the web client imports for end-to-end types.
  return new Hono()
    .use(deps.logRequests === false ? (_c, next) => next() : logger())
    .get("/api/health", (c) => c.json({ ok: true, at: new Date().toISOString() }))
    .route("/api/papers", papersRoute(deps.db))
    .route("/api/searches", searchesRoute(deps));
}

export type AppType = ReturnType<typeof createApp>;
