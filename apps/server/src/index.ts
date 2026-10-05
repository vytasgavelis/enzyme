import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { createCardGenerator, DEFAULT_MODEL } from "./ai/card-agent.js";
import { createEnzymeMastra } from "./ai/mastra.js";
import { createQuerySuggester, mastraQueryRunner } from "./ai/query-agent.js";
import { createApp } from "./app.js";
import { db, repoRoot, runMigrations } from "./db/index.js";
import { failInterruptedRuns } from "./db/searches.js";
import { europePmc } from "./sources/europepmc.js";
import { serveWeb } from "./web.js";

runMigrations();
const interrupted = failInterruptedRuns(db);
if (interrupted > 0) console.log(`marked ${interrupted} interrupted pull(s) as failed`);

const model = process.env.ENZYME_MODEL || DEFAULT_MODEL;
if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && model.startsWith("google/")) {
  console.warn(
    "GOOGLE_GENERATIVE_AI_API_KEY is not set: searches and pulls work, but study cards and Suggest query will fail until it is",
  );
}
const mastra = createEnzymeMastra(
  model,
  resolve(repoRoot, process.env.TRACES_PATH ?? "data/mastra.db"),
);
const suggestQuery = createQuerySuggester({
  runAgent: mastraQueryRunner(mastra.getAgent("queryWriter"), model),
  countHits: async (query) => (await europePmc.search(query, { pageSize: 1 })).hitCount,
});
const app = createApp({
  db,
  europePmc,
  generateCard: createCardGenerator(model, mastra.getAgent("studyCard")),
  suggestQuery,
});
// Deployment serves the built web app from here too; in development Vite does
if (process.env.WEB_DIST) serveWeb(app, resolve(repoRoot, process.env.WEB_DIST));
const port = Number(process.env.PORT ?? 3210);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`enzyme api listening on http://localhost:${info.port} (model ${model})`);
});
