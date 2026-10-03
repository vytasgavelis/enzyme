import { Hono } from "hono";
import { logger } from "hono/logger";
import type { GenerateCard } from "./ai/card-agent.js";
import { papersRoute } from "./routes/papers.js";
import { type SearchesRouteDeps, searchesRoute } from "./routes/searches.js";

export interface AppDeps extends SearchesRouteDeps {
  /** The study card model call (T-7); tests pass a fake. */
  generateCard: GenerateCard;
  /** Log each request and model call. Default `true`; tests turn it off. */
  logRequests?: boolean;
}

/** Builds the API on the given database, Europe PMC client and model (tests pass fakes). */
export function createApp(deps: AppDeps) {
  const quiet = deps.logRequests === false;
  // Chain every route here. `AppType` is what the web client imports for end-to-end types.
  return new Hono()
    .use(quiet ? (_c, next) => next() : logger())
    .get("/api/health", (c) => c.json({ ok: true, at: new Date().toISOString() }))
    .route(
      "/api/papers",
      papersRoute({
        db: deps.db,
        generateCard: deps.generateCard,
        log: quiet ? () => {} : undefined,
      }),
    )
    .route("/api/searches", searchesRoute(deps));
}

export type AppType = ReturnType<typeof createApp>;
