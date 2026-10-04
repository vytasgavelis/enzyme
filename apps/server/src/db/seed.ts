import type { Db } from "./client.js";
import { savedSearches } from "./schema.js";
import { createSearch, type SearchFields } from "./searches.js";

/**
 * Her starting watchlist (T-9). The queries are fixed rather than suggested live, so seeding
 * is fast, deterministic and works without a model key. Most came from the T-11 query agent
 * and were checked by hand with `pnpm epmc "<query>" --max 1` (hit counts in the README).
 */
export const seedSearches: SearchFields[] = [
  {
    name: "Anti-inflammatory diet",
    intent: "Research on anti-inflammatory diets and what they do in people",
    query: 'TITLE_ABS:"anti-inflammatory diet" OR TITLE_ABS:"anti inflammatory diet"',
  },
  {
    name: "Autoimmune disease",
    intent: "Autoimmune diseases in general: causes, diet and treatment",
    query: 'TITLE:("autoimmune disease*" OR "autoimmune disorder*")',
  },
  {
    name: "Gut health",
    intent: "Gut health and the gut microbiome",
    query: 'TITLE:"gut health"',
  },
  {
    name: "Omega-3 and inflammation markers",
    intent: "Omega-3 fatty acids and inflammation markers such as CRP and IL-6",
    query:
      '(TITLE_ABS:"omega-3 fatty acid*" OR TITLE_ABS:"omega 3 fatty acid*" OR TITLE_ABS:"EPA" OR TITLE_ABS:"DHA") AND (TITLE_ABS:"inflammation marker*" OR TITLE_ABS:"CRP" OR TITLE_ABS:"C-reactive protein" OR TITLE_ABS:"IL-6" OR TITLE_ABS:"interleukin-6")',
  },
  {
    name: "Probiotics for IBS",
    intent: "Probiotics for irritable bowel syndrome",
    query:
      '(TITLE_ABS:probiotic* OR TITLE_ABS:probiotics) AND (TITLE_ABS:"irritable bowel syndrome" OR TITLE_ABS:IBS)',
  },
  {
    name: "Vitamin D and autoimmune thyroid",
    intent: "Vitamin D and autoimmune thyroid disease (Hashimoto's, Graves')",
    query:
      '(TITLE_ABS:"vitamin D" OR TITLE_ABS:"cholecalciferol") AND (TITLE_ABS:"autoimmune thyroid disease" OR TITLE_ABS:"Hashimoto*" OR TITLE_ABS:"Graves\' disease" OR TITLE_ABS:"Graves disease")',
  },
];

export interface SeedResult {
  created: { id: number; name: string }[];
  /** Existing searches with the same name or query, left as they are (she may have edited them). */
  skipped: { id: number; name: string }[];
}

const nameKey = (name: string) => `name:${name.trim().toLowerCase()}`;
const queryKey = (query: string) => `query:${query.trim()}`;

/**
 * Adds each search whose name (case-insensitive) and query aren't taken yet, so running it
 * twice creates nothing the second time.
 */
export function seed(db: Db, searches: SearchFields[] = seedSearches): SeedResult {
  const result: SeedResult = { created: [], skipped: [] };
  const existing = new Map<string, { id: number; name: string }>();
  const remember = (row: { id: number; name: string; query: string }) => {
    const entry = { id: row.id, name: row.name };
    existing.set(nameKey(row.name), entry);
    existing.set(queryKey(row.query), entry);
  };
  db.select().from(savedSearches).all().forEach(remember);

  for (const fields of searches) {
    const found = existing.get(nameKey(fields.name)) ?? existing.get(queryKey(fields.query));
    if (found) {
      result.skipped.push(found);
      continue;
    }
    const created = createSearch(db, fields);
    remember(created);
    result.created.push({ id: created.id, name: created.name });
  }
  return result;
}
