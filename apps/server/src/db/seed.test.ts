import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db, migrateDb } from "./client.js";
import { savedSearches } from "./schema.js";
import { createSearch } from "./searches.js";
import { seed, seedSearches } from "./seed.js";

let db: Db;
const names = () =>
  db
    .select({ name: savedSearches.name })
    .from(savedSearches)
    .all()
    .map((r) => r.name);

beforeEach(() => {
  db = createDb(":memory:");
  migrateDb(db);
});

describe("seed", () => {
  it("creates her searches with their plain-English intent", () => {
    const result = seed(db);
    expect(result.created).toHaveLength(seedSearches.length);
    expect(result.skipped).toEqual([]);
    const rows = db.select().from(savedSearches).all();
    expect(rows.map((r) => r.name)).toEqual(seedSearches.map((s) => s.name));
    expect(rows.every((r) => r.intent && r.query)).toBe(true);
  });

  it("creates nothing the second time", () => {
    seed(db);
    const again = seed(db);
    expect(again.created).toEqual([]);
    expect(again.skipped).toHaveLength(seedSearches.length);
    expect(names()).toHaveLength(seedSearches.length);
  });

  it("leaves a search with the same name or the same query alone", () => {
    const [first, second] = seedSearches;
    if (!first || !second) throw new Error("seed list too short");
    createSearch(db, { name: first.name.toUpperCase(), query: "edited by her", intent: null });
    createSearch(db, { name: "Her own name", query: second.query, intent: null });

    const result = seed(db);
    expect(result.skipped.map((s) => s.name)).toEqual([first.name.toUpperCase(), "Her own name"]);
    expect(names()).toHaveLength(seedSearches.length);
    expect(names()).toContain("Her own name");
  });
});
