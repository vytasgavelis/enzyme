import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { db, runMigrations } from "./db/index.js";
import { failInterruptedRuns } from "./db/searches.js";
import { europePmc } from "./sources/europepmc.js";

runMigrations();
const interrupted = failInterruptedRuns(db);
if (interrupted > 0) console.log(`marked ${interrupted} interrupted pull(s) as failed`);

const app = createApp({ db, europePmc });
const port = Number(process.env.PORT ?? 3210);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`enzyme api listening on http://localhost:${info.port}`);
});
