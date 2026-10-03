/**
 * Fetch and print mapped Europe PMC records, for checking the client by hand.
 *
 *   pnpm epmc "peptides AND sleep" --max 50          one line per record
 *   pnpm epmc "peptides AND sleep" --max 5 --json    full PaperInput per line (NDJSON)
 *   pnpm epmc "magnesium" --all-records               don't add HAS_ABSTRACT:y
 */
import { parseArgs } from "node:util";
import { europePmc } from "../sources/europepmc.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    max: { type: "string", default: "20" },
    json: { type: "boolean", default: false },
    "all-records": { type: "boolean", default: false },
  },
});

const query = positionals.join(" ");
const maxRecords = Number(values.max);
if (!query || !Number.isInteger(maxRecords) || maxRecords < 1) {
  console.error('Usage: pnpm epmc "<query>" [--max N] [--json] [--all-records]');
  process.exit(1);
}

let hitCount = 0;
let count = 0;
for await (const { paper } of europePmc.searchAll(query, {
  maxRecords,
  requireAbstract: !values["all-records"],
  onPage: (progress) => {
    hitCount = progress.hitCount;
  },
})) {
  count++;
  if (values.json) {
    console.log(JSON.stringify(paper));
  } else {
    const id = paper.pmid ? `PMID ${paper.pmid}` : `${paper.source} ${paper.sourceId}`;
    const tags = [paper.isPreprint && "preprint", paper.isOpenAccess && "OA"].filter(Boolean);
    console.log(
      `${String(count).padStart(4)}. [${paper.firstPublicationDate ?? "????"}] ${id}` +
        `${tags.length ? ` (${tags.join(", ")})` : ""}\n` +
        `      ${paper.title ?? "(no title)"}\n` +
        `      ${paper.journal ?? "(no journal)"} · ${paper.pubTypes?.join(", ") ?? "?"}` +
        ` · MeSH ${paper.meshHeadings?.length ?? "n/a"} · cited ${paper.citedByCount ?? "?"}`,
    );
  }
}
console.error(`\n${count} of ${hitCount} hits`);
