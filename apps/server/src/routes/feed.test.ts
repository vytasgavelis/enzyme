import type { FeedPage, FeedQuery, PaperInput } from "@enzyme/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { ftsQuery } from "../db/feed.js";
import { upsertPaper } from "../db/papers.js";
import { savedSearches, searchPapers } from "../db/schema.js";
import { paper, testApp } from "./test-helpers.js";

const NOW = Date.parse("2026-10-03T10:00:00.000Z");
const VISIT = new Date(NOW - 3_600_000).toISOString();

/** Seeded papers, keyed so tests can assert on titles. `recent` ones matched after VISIT. */
const seed: { key: string; recent?: boolean; p: Partial<PaperInput> }[] = [
  {
    key: "meta",
    p: {
      title: "Magnesium and sleep: a <i>meta-analysis</i>",
      pubTypes: ["Meta-Analysis", "Journal Article"],
      meshHeadings: ["Humans", "Magnesium"],
      firstPublicationDate: "2024-05-01",
      citedByCount: 40,
      isOpenAccess: true,
    },
  },
  {
    key: "rct",
    recent: true,
    p: {
      title: "Magnesium glycinate for insomnia",
      pubTypes: ["Randomized Controlled Trial"],
      meshHeadings: ["Humans"],
      firstPublicationDate: "2026-09-01",
      citedByCount: 2,
    },
  },
  {
    key: "rat",
    p: {
      title: "Magnesium deficiency in rats",
      pubTypes: ["Journal Article"],
      meshHeadings: ["Animals", "Rats"],
      firstPublicationDate: "2025-01-10",
      citedByCount: 10,
    },
  },
  {
    key: "preprint",
    recent: true,
    p: {
      source: "PPR",
      pmid: null,
      title: "A randomised trial of magnesium on sleep latency",
      pubTypes: ["preprint"],
      meshHeadings: null,
      firstPublicationDate: "2026-09-20",
      citedByCount: null,
      isPreprint: true,
      isOpenAccess: true,
    },
  },
  {
    key: "retracted",
    p: {
      title: "Zinc and sleep",
      abstract: "A <h4>Results</h4>retracted paper about zinc.",
      pubTypes: ["Retracted Publication", "Review"],
      meshHeadings: ["Humans"],
      firstPublicationDate: "2023-03-03",
      citedByCount: 5,
    },
  },
  {
    key: "review",
    p: {
      title: "Sleep hygiene",
      abstract: "Narrative overview of sleep hygiene including magnesium.",
      pubTypes: ["review-article"],
      meshHeadings: null,
      firstPublicationDate: "2022-07-07",
      citedByCount: 100,
    },
  },
];

let t: ReturnType<typeof testApp>;
let searchId: number;
let other: number;
const idOf: Record<string, number> = {};

beforeAll(() => {
  t = testApp();
  searchId = t.db.insert(savedSearches).values({ name: "mg", query: "mg" }).returning().get().id;
  other = t.db.insert(savedSearches).values({ name: "o", query: "o" }).returning().get().id;
  for (const { key, recent, p } of seed) {
    const { id } = upsertPaper(t.db, paper(p), {});
    idOf[key] = id;
    t.db
      .insert(searchPapers)
      .values({
        searchId,
        paperId: id,
        firstMatchedAt: new Date(recent ? NOW : NOW - 86_400_000),
      })
      .run();
  }
  // A paper in another search only.
  const { id } = upsertPaper(t.db, paper({ title: "Magnesium elsewhere" }), {});
  t.db.insert(searchPapers).values({ searchId: other, paperId: id }).run();
});

function qs(query: FeedQuery) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    for (const item of Array.isArray(v) ? v : [v]) params.append(k, String(item));
  }
  return params.toString();
}

async function feed(query: FeedQuery = {}) {
  const res = await t.call<FeedPage>("GET", `/api/searches/${searchId}/papers?${qs(query)}`);
  expect(res.status).toBe(200);
  return res.body;
}

const keysOf = (page: FeedPage) =>
  page.items.map((i) => Object.keys(idOf).find((k) => idOf[k] === i.id));

describe("feed", () => {
  it("returns the search's papers newest first, hiding retracted by default", async () => {
    const page = await feed();
    expect(keysOf(page)).toEqual(["preprint", "rct", "rat", "meta", "review"]);
    expect(page).toMatchObject({ total: 5, searchTotal: 6, newCount: 0, page: 1, pageSize: 25 });
  });

  it("returns derived tier, species and retraction as fields", async () => {
    const page = await feed({ hideRetracted: false });
    const byKey = Object.fromEntries(page.items.map((i, n) => [keysOf(page)[n], i]));
    expect(byKey.meta).toMatchObject({ tier: "meta-analysis", tierFromTitle: false });
    expect(byKey.meta?.species).toBe("human");
    expect(byKey.rat).toMatchObject({ tier: "other", species: "animal" });
    expect(byKey.preprint).toMatchObject({ tier: "rct", tierFromTitle: true, species: "unknown" });
    expect(byKey.review).toMatchObject({ tier: "review", species: "unknown" });
    expect(byKey.retracted).toMatchObject({ isRetracted: true, tier: "review" });
    // Full record for expand-in-place.
    expect(byKey.retracted?.abstract).toContain("<h4>Results</h4>");
    expect(byKey.meta?.title).toBe("Magnesium and sleep: a <i>meta-analysis</i>");
  });

  it("filters by one or several tiers", async () => {
    expect(keysOf(await feed({ tiers: ["rct"] }))).toEqual(["preprint", "rct"]);
    expect(keysOf(await feed({ tiers: ["meta-analysis", "review"] }))).toEqual(["meta", "review"]);
  });

  it("rejects an unknown tier", async () => {
    const res = await t.call("GET", `/api/searches/${searchId}/papers?tiers=bogus`);
    expect(res.status).toBe(400);
  });

  it("filters by species", async () => {
    expect(keysOf(await feed({ species: "no-animal" }))).toEqual([
      "preprint",
      "rct",
      "meta",
      "review",
    ]);
    expect(keysOf(await feed({ species: "human" }))).toEqual(["rct", "meta"]);
  });

  it("filters preprints, open access and date", async () => {
    expect(keysOf(await feed({ preprints: "only" }))).toEqual(["preprint"]);
    expect(keysOf(await feed({ preprints: "exclude" }))).toEqual(["rct", "rat", "meta", "review"]);
    expect(keysOf(await feed({ openAccessOnly: true }))).toEqual(["preprint", "meta"]);
    expect(keysOf(await feed({ from: "2025-01-10" }))).toEqual(["preprint", "rct", "rat"]);
  });

  it("shows retracted papers when asked", async () => {
    expect(keysOf(await feed({ hideRetracted: false, q: "zinc" }))).toEqual(["retracted"]);
    expect(keysOf(await feed({ q: "zinc" }))).toEqual([]);
  });

  it("searches title and abstract text with FTS, by word prefix", async () => {
    expect(keysOf(await feed({ q: "glycin" }))).toEqual(["rct"]);
    // Matches the abstract only, and HTML in the title doesn't get in the way.
    expect(keysOf(await feed({ q: "hygiene magnesium" }))).toEqual(["review"]);
    expect(keysOf(await feed({ q: "meta-analysis" }))).toEqual(["meta"]);
    // FTS syntax in user input is harmless.
    expect(keysOf(await feed({ q: 'sleep" (' }))).toEqual(["preprint", "meta", "review"]);
  });

  it("flags papers matched after newSince and counts them ignoring filters", async () => {
    const page = await feed({ newSince: VISIT, tiers: ["meta-analysis"] });
    expect(page.newCount).toBe(2);
    expect(page.items[0]?.isNew).toBe(false);

    const fresh = await feed({ newSince: VISIT, newOnly: true });
    expect(keysOf(fresh)).toEqual(["preprint", "rct"]);
    expect(fresh.items.every((i) => i.isNew)).toBe(true);

    // Without a cut-off nothing is new.
    expect((await feed({ newOnly: true })).total).toBe(0);
  });

  it("sorts by tier and by citations", async () => {
    expect(keysOf(await feed({ sort: "tier" }))).toEqual([
      "meta",
      "preprint",
      "rct",
      "review",
      "rat",
    ]);
    expect(keysOf(await feed({ sort: "cited" }))).toEqual([
      "review",
      "meta",
      "rat",
      "rct",
      "preprint",
    ]);
  });

  it("combines filters", async () => {
    const page = await feed({
      q: "magnesium",
      species: "no-animal",
      preprints: "exclude",
      from: "2024-01-01",
    });
    expect(keysOf(page)).toEqual(["rct", "meta"]);
  });

  it("pages through the results", async () => {
    const one = await feed({ pageSize: 2 });
    const three = await feed({ pageSize: 2, page: 3 });
    expect(keysOf(one)).toEqual(["preprint", "rct"]);
    expect(keysOf(three)).toEqual(["review"]);
    expect(three).toMatchObject({ total: 5, page: 3, pageSize: 2 });
    expect((await feed({ page: 9 })).items).toEqual([]);
  });

  it("validates the query", async () => {
    for (const bad of ["pageSize=101", "page=0", "sort=random", "from=2024", "species=cat"]) {
      const res = await t.call("GET", `/api/searches/${searchId}/papers?${bad}`);
      expect(res.status, bad).toBe(400);
    }
  });

  it("answers within 200 ms for 1,000 papers (T-5 acceptance)", async () => {
    const big = testApp();
    const s = big.db.insert(savedSearches).values({ name: "b", query: "b" }).returning().get();
    big.db.transaction(() => {
      for (let i = 0; i < 1000; i++) {
        const { id } = upsertPaper(
          big.db,
          paper({
            title: `Trial ${i} of magnesium in sleep`,
            abstract: "Background. ".repeat(150),
            pubTypes: i % 3 ? ["Journal Article"] : ["Randomized Controlled Trial"],
            meshHeadings: i % 2 ? ["Humans", "Sleep"] : null,
            firstPublicationDate: `20${10 + (i % 16)}-01-01`,
            citedByCount: i,
          }),
          {},
        );
        big.db.insert(searchPapers).values({ searchId: s.id, paperId: id }).run();
      }
    });
    await big.call("GET", `/api/searches/${s.id}/papers`); // warm up
    for (const query of ["", "sort=tier&species=human", "q=magnesium&sort=cited&tiers=rct"]) {
      const started = performance.now();
      const res = await big.call<FeedPage>("GET", `/api/searches/${s.id}/papers?${query}`);
      expect(performance.now() - started, query).toBeLessThan(200);
      expect(res.body.searchTotal).toBe(1000);
    }
  });
});

describe("ftsQuery", () => {
  it("quotes words as prefixes and drops syntax", () => {
    expect(ftsQuery("Magnesium  sleep")).toBe('"Magnesium"* "sleep"*');
    expect(ftsQuery('"a" OR (b*')).toBe('"a"* "OR"* "b"*');
    expect(ftsQuery("  -- ")).toBeNull();
  });
});
