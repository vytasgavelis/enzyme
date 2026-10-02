import { serve } from "@hono/node-server";
import app from "./app.js";
import { runMigrations } from "./db/index.js";

runMigrations();

const port = Number(process.env.PORT ?? 3210);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`enzyme api listening on http://localhost:${info.port}`);
});
