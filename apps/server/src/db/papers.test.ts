import type { PaperInput } from "@enzyme/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db, migrateDb } from "./client.js";
import { normaliseDoi, upsertPaper } from "./papers.js";
import { papers, savedSearches, searchPapers } from "./schema.js";

const base: PaperInput = {
  source: "MED",
  sourceId: "40000001",
  pmid: "40000001",
  pmcid: null,
  doi: "10.1000/Mg.Sleep",
  title: "Effects of <i>magnesium</i> on sleep quality",
  abstract: "<h4>Background</h4>Magnesium intake and CO<sub>2</sub> levels.",
  authors: "Doe J.",
  journal: "Sleep Medicine",
  firstPublicationDate: "2026-09-01",
  pubYear: 2026,
  pubTypes: ["Journal Article"],
  meshHeadings: ["Humans", "Magnesium"],
  keywords: null,
  citedByCount: 0,
  isOpenAccess: false,
  fullTextUrls: null,
  isPreprint: false,
};

let db: Db;
const rows = () => db.select().from(papers).all();
/** The only stored paper; fails the test if there isn't exactly one. */
const onlyRow = () => {
  const all = rows();
  expect(all).toHaveLength(1);
  return all[0] as (typeof all)[number];
};
const ftsMatch = (q: string) =>
  db.$client.prepare("SELECT rowid FROM papers_fts WHERE papers_fts MATCH ?").all(q);

beforeEach(() => {
  db = createDb(":memory:");
  migrateDb(db);
});

describe("migrations", () => {
  it("re-running is a no-op", () => {
    const tables = () => db.$client.prepare("SELECT name FROM sqlite_master ORDER BY name").all();
    const before = tables();
    upsertPaper(db, base, {});
    migrateDb(db);
    expect(tables()).toEqual(before);
    expect(rows()).toHaveLength(1);
  });
});

describe("upsertPaper", () => {
  it("inserts a new paper with a normalised DOI and stripped text", () => {
    const result = upsertPaper(db, base, { id: "40000001" });
    expect(result.inserted).toBe(true);
    expect(rows()[0]).toMatchObject({
      id: result.id,
      doi: "10.1000/mg.sleep",
      titleText: "Effects of magnesium on sleep quality",
      abstractText: "Background Magnesium intake and CO2 levels.",
      pubTypes: ["Journal Article"],
      raw: { id: "40000001" },
    });
  });

  it("same PMID twice → one row, updated_at bumped", async () => {
    const first = upsertPaper(db, base, {});
    const before = onlyRow();
    await new Promise((r) => setTimeout(r, 5));
    const second = upsertPaper(db, { ...base, citedByCount: 3 }, {});
    expect(second).toEqual({ id: first.id, inserted: false });
    const after = onlyRow();
    expect(after.citedByCount).toBe(3);
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    expect(after.firstSeenAt).toEqual(before.firstSeenAt);
  });

  it("same DOI from a different source → merged into one row", () => {
    const preprint: PaperInput = {
      ...base,
      source: "PPR",
      sourceId: "PPR123",
      pmid: null,
      doi: "https://doi.org/10.1000/MG.SLEEP",
      meshHeadings: null,
      isPreprint: true,
    };
    const first = upsertPaper(db, preprint, { from: "PPR" });
    const second = upsertPaper(db, base, { from: "MED" });
    expect(second).toEqual({ id: first.id, inserted: false });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({
      source: "PPR",
      sourceId: "PPR123",
      pmid: "40000001",
      meshHeadings: ["Humans", "Magnesium"],
      isPreprint: false,
      raw: { from: "MED" },
    });
  });

  it("finds a paper without PMID or DOI by source id", () => {
    const bare = { ...base, pmid: null, doi: null };
    const first = upsertPaper(db, bare, {});
    expect(upsertPaper(db, bare, {})).toEqual({ id: first.id, inserted: false });
  });

  it("never erases a known value with null", () => {
    upsertPaper(db, base, {});
    upsertPaper(db, { ...base, abstract: null, meshHeadings: null, citedByCount: null }, {});
    expect(rows()[0]).toMatchObject({
      abstract: base.abstract,
      meshHeadings: base.meshHeadings,
      citedByCount: 0,
    });
  });

  it("keeps the PMID match and skips a DOI owned by another row", () => {
    const a = upsertPaper(db, { ...base, doi: null }, {});
    const b = upsertPaper(db, { ...base, sourceId: "X", pmid: "2", doi: "10.1/other" }, {});
    const merged = upsertPaper(db, { ...base, doi: "10.1/other" }, {});
    expect(merged.id).toBe(a.id);
    const byId = (id: number) => db.select().from(papers).where(eq(papers.id, id)).get();
    expect(byId(a.id)?.doi).toBeNull();
    expect(byId(b.id)?.doi).toBe("10.1/other");
  });
});

describe("papers_fts", () => {
  it("matches stripped title/abstract text", () => {
    const { id } = upsertPaper(db, base, {});
    expect(ftsMatch("magnesium")).toEqual([{ rowid: id }]);
    expect(ftsMatch("co2")).toEqual([{ rowid: id }]);
    expect(ftsMatch("sub")).toEqual([]);
  });

  it("follows text changes and deletes", () => {
    const { id } = upsertPaper(db, base, {});
    upsertPaper(db, { ...base, title: "Zinc and sleep", abstract: "Zinc only." }, {});
    expect(ftsMatch("magnesium")).toEqual([]);
    expect(ftsMatch("zinc")).toEqual([{ rowid: id }]);
    db.delete(papers).where(eq(papers.id, id)).run();
    expect(ftsMatch("zinc")).toEqual([]);
    const integrityCheck = "INSERT INTO papers_fts(papers_fts) VALUES ('integrity-check')";
    expect(() => db.$client.prepare(integrityCheck).run()).not.toThrow();
  });
});

describe("search links", () => {
  it("are removed with their saved search", () => {
    const { id: paperId } = upsertPaper(db, base, {});
    const search = db
      .insert(savedSearches)
      .values({ name: "Mg", query: "magnesium" })
      .returning()
      .get();
    db.insert(searchPapers).values({ searchId: search.id, paperId }).run();
    db.delete(savedSearches).where(eq(savedSearches.id, search.id)).run();
    expect(db.select().from(searchPapers).all()).toEqual([]);
  });
});

describe("normaliseDoi", () => {
  it.each([
    ["10.1/ABC", "10.1/abc"],
    ["https://doi.org/10.1/x", "10.1/x"],
    ["http://dx.doi.org/10.1/x", "10.1/x"],
    ["doi: 10.1/x", "10.1/x"],
    ["  ", null],
    [null, null],
  ])("%s → %s", (input, expected) => {
    expect(normaliseDoi(input)).toBe(expected);
  });
});
