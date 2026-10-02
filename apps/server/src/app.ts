import { Hono } from "hono";
import { logger } from "hono/logger";
import { papersRoute } from "./routes/papers.js";

const app = new Hono().use(logger());

// Chain every route here. `AppType` is what the web client imports for end-to-end types.
const routes = app
  .get("/api/health", (c) => c.json({ ok: true, at: new Date().toISOString() }))
  .route("/api/papers", papersRoute);

export type AppType = typeof routes;
export default app;
