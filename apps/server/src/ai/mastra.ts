import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { MastraStorageExporter, Observability } from "@mastra/observability";
import { createCardAgent } from "./card-agent.js";
import { createQueryAgent } from "./query-agent.js";

/**
 * The app's one Mastra instance (T-13): both agents, with tracing. Every agent run records a
 * trace (agent run → model steps → tool calls) with input, output, token usage and timing,
 * stored locally in `tracesPath` (a libsql/SQLite file, kept apart from the app database).
 * Nothing leaves the machine. Read traces with `pnpm traces`.
 */
export function createEnzymeMastra(modelId: string, tracesPath: string) {
  return new Mastra({
    agents: {
      studyCard: createCardAgent(modelId),
      queryWriter: createQueryAgent(modelId),
    },
    storage: new LibSQLStore({ id: "enzyme-traces", url: `file:${tracesPath}` }),
    observability: new Observability({
      configs: {
        local: { serviceName: "enzyme", exporters: [new MastraStorageExporter()] },
      },
    }),
    // Mastra's own logger is chatty at info; our per-call log lines stay in place.
    logger: false,
  });
}
