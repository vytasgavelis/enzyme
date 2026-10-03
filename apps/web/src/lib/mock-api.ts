/**
 * PROTOTYPE: an in-browser stand-in for the saved-search, pull and feed endpoints (T-4/T-5),
 * so the UI can be agreed before the server exists. Implements `EnzymeApi` from `./enzyme-api`
 * using real Europe PMC records recorded into `mocks/europepmc-pools.json`. State lives in
 * localStorage; `resetMockData()` restores the seed.
 *
 * Replace with an `hc<AppType>` implementation of `EnzymeApi` once T-4/T-5 land.
 */
import {
  deriveSpecies,
  deriveTier,
  type FeedPage,
  type FeedPaper,
  type FeedQuery,
  feedQuerySchema,
  isRetracted,
  type PaperInput,
  PULL_CAP,
  type PullRun,
  type SavedSearch,
  type SavedSearchInput,
  savedSearchInputSchema,
  stripHtml,
  tiers,
} from "@enzyme/shared";
import pools from "@/mocks/europepmc-pools.json";
import { ApiError, type EnzymeApi } from "./enzyme-api";

interface Pool {
  key: string;
  name: string;
  query: string;
  papers: PaperInput[];
}

interface StoredSearch {
  id: number;
  name: string;
  query: string;
  createdAt: string;
  lastRunAt: string | null;
  lastViewedAt: string | null;
}

interface Store {
  nextId: number;
  searches: StoredSearch[];
  /** paper id -> record; ids are `source:sourceId` indexes into the pools. */
  papers: Record<number, PaperInput & { firstSeenAt: string }>;
  links: { searchId: number; paperId: number; firstMatchedAt: string }[];
  runs: PullRun[];
}

const STORAGE_KEY = "enzyme-mock-v2";
const ALL_POOLS = pools as Pool[];
const ALL_RECORDS: PaperInput[] = ALL_POOLS.flatMap((p) => p.papers);
/** Stable paper ids, as the server's surrogate key would be. */
const PAPER_ID = new Map(ALL_RECORDS.map((p, i) => [`${p.source}:${p.sourceId}`, i + 1]));
const paperId = (p: PaperInput) => PAPER_ID.get(`${p.source}:${p.sourceId}`) ?? 0;

const tierOf = (p: PaperInput) => {
  const { tier, fromTitle } = deriveTier(p.pubTypes, p.title && stripHtml(p.title));
  return { tier, tierFromTitle: fromTitle };
};

const iso = (d: Date | number) => new Date(d).toISOString();
const hoursAgo = (h: number) => iso(Date.now() - h * 3_600_000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Three searches already pulled, the four newest papers of each held back so "Pull" finds
 * something. In the first two searches, the last pull (after her last visit) brought a few papers.
 */
function seed(): Store {
  const store: Store = { nextId: 1, searches: [], papers: {}, links: [], runs: [] };
  const seeded = ALL_POOLS.slice(0, 3);
  seeded.forEach((pool, i) => {
    const id = store.nextId++;
    store.searches.push({
      id,
      name: pool.name,
      query: pool.query,
      createdAt: hoursAgo(48),
      lastRunAt: hoursAgo(1 + i),
      lastViewedAt: hoursAgo(3),
    });
    const newestFirst = [...pool.papers].sort((a, b) =>
      (b.firstPublicationDate ?? "").localeCompare(a.firstPublicationDate ?? ""),
    );
    const pulled = newestFirst.slice(4);
    pulled.forEach((p, j) => {
      const pid = paperId(p);
      store.papers[pid] ??= { ...p, firstSeenAt: hoursAgo(40) };
      const arrivedLastPull = i < 2 && j % 8 === 1 + i;
      store.links.push({
        searchId: id,
        paperId: pid,
        firstMatchedAt: arrivedLastPull ? hoursAgo(1) : hoursAgo(40),
      });
    });
    const newMatches = store.links.filter(
      (l) => l.searchId === id && l.firstMatchedAt > hoursAgo(2),
    ).length;
    store.runs.push({
      id: store.runs.length + 1,
      searchId: id,
      status: "succeeded",
      startedAt: hoursAgo(1 + i),
      finishedAt: hoursAgo(1 + i),
      hitCount: pulled.length,
      target: pulled.length,
      fetched: pulled.length,
      inserted: newMatches,
      newMatches,
      error: null,
    });
  });
  return store;
}

function load(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const store = JSON.parse(raw) as Store;
      // A pull can't survive a reload; finish it as failed like a crashed server would.
      for (const r of store.runs) {
        if (r.status === "running") {
          r.status = "failed";
          r.finishedAt = iso(Date.now());
          r.error = "Interrupted (page reloaded)";
        }
      }
      return store;
    }
  } catch {
    // Fall through to a fresh seed.
  }
  return seed();
}

let store = load();
const save = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Prototype only; in-memory state still works.
  }
};

export function resetMockData() {
  store = seed();
  save();
}

/** What Europe PMC would return for a query: the recorded pool it names, else a word match. */
function recordsFor(query: string): PaperInput[] {
  const q = query.toLowerCase();
  const pool = ALL_POOLS.find((p) => q.includes(p.key));
  if (pool) return pool.papers;
  const words = q
    .replace(/\b(and|or|not)\b|["()]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  if (words.length === 0) return [];
  return ALL_RECORDS.filter((p) => {
    const text = stripHtml(`${p.title ?? ""} ${p.abstract ?? ""}`).toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

function findSearch(id: number): StoredSearch {
  const s = store.searches.find((x) => x.id === id);
  if (!s) throw new ApiError(404, "Search not found");
  return s;
}

function toSavedSearch(s: StoredSearch): SavedSearch {
  const links = store.links.filter((l) => l.searchId === s.id);
  const runs = store.runs.filter((r) => r.searchId === s.id);
  return {
    ...s,
    paperCount: links.length,
    newCount: s.lastViewedAt
      ? links.filter((l) => l.firstMatchedAt > (s.lastViewedAt ?? "")).length
      : 0,
    lastRun: runs.at(-1) ?? null,
  };
}

function parseInput(input: SavedSearchInput) {
  const parsed = savedSearchInputSchema.safeParse(input);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid search");
  const { name, query } = parsed.data;
  return { name, query: query || name };
}

const tierRank = (t: FeedPaper["tier"]) => tiers.indexOf(t);

async function runPull(run: PullRun) {
  const search = findSearch(run.searchId);
  const records = recordsFor(search.query).slice(0, PULL_CAP);
  await sleep(600);
  run.hitCount = records.length;
  run.target = records.length;
  save();
  // Europe PMC pages of 100 take ~1s; recorded pools are small, so fake a few steps.
  const step = Math.max(1, Math.ceil(records.length / 6));
  for (let i = 0; i < records.length; i += step) {
    await sleep(500);
    const now = iso(Date.now());
    for (const p of records.slice(i, i + step)) {
      const pid = paperId(p);
      if (!store.papers[pid]) {
        store.papers[pid] = { ...p, firstSeenAt: now };
        run.inserted++;
      }
      if (!store.links.some((l) => l.searchId === search.id && l.paperId === pid)) {
        store.links.push({ searchId: search.id, paperId: pid, firstMatchedAt: now });
        run.newMatches++;
      }
      run.fetched++;
    }
    save();
  }
  run.status = "succeeded";
  run.finishedAt = iso(Date.now());
  search.lastRunAt = run.finishedAt;
  save();
}

export const mockApi: EnzymeApi = {
  async listSearches() {
    await sleep(80);
    return store.searches.map(toSavedSearch);
  },

  async createSearch(input) {
    await sleep(120);
    const { name, query } = parseInput(input);
    const s: StoredSearch = {
      id: store.nextId++,
      name,
      query,
      createdAt: iso(Date.now()),
      lastRunAt: null,
      lastViewedAt: null,
    };
    store.searches.push(s);
    save();
    return toSavedSearch(s);
  },

  async updateSearch(id, input) {
    await sleep(120);
    const s = findSearch(id);
    Object.assign(s, parseInput(input));
    save();
    return toSavedSearch(s);
  },

  async deleteSearch(id) {
    await sleep(120);
    findSearch(id);
    store.searches = store.searches.filter((s) => s.id !== id);
    store.links = store.links.filter((l) => l.searchId !== id);
    store.runs = store.runs.filter((r) => r.searchId !== id);
    save();
  },

  async markViewed(id) {
    await sleep(60);
    const s = findSearch(id);
    const previousViewedAt = s.lastViewedAt;
    s.lastViewedAt = iso(Date.now());
    save();
    return { previousViewedAt };
  },

  async startPull(id) {
    await sleep(150);
    findSearch(id);
    const running = store.runs.find((r) => r.searchId === id && r.status === "running");
    if (running) return running;
    const run: PullRun = {
      id: store.runs.length + 1,
      searchId: id,
      status: "running",
      startedAt: iso(Date.now()),
      finishedAt: null,
      hitCount: null,
      target: null,
      fetched: 0,
      inserted: 0,
      newMatches: 0,
      error: null,
    };
    store.runs.push(run);
    save();
    void runPull(run).catch((e: unknown) => {
      run.status = "failed";
      run.finishedAt = iso(Date.now());
      run.error = e instanceof Error ? e.message : String(e);
      save();
    });
    return { ...run };
  },

  async getLatestRun(id) {
    await sleep(40);
    findSearch(id);
    const run = store.runs.filter((r) => r.searchId === id).at(-1);
    return run ? { ...run } : null;
  },

  async getFeed(id, query: FeedQuery): Promise<FeedPage> {
    await sleep(150);
    findSearch(id);
    const f = feedQuerySchema.parse(query);
    const q = f.q.toLowerCase();

    const all: FeedPaper[] = store.links
      .filter((l) => l.searchId === id)
      .flatMap((l) => {
        const p = store.papers[l.paperId];
        if (!p) return [];
        return {
          ...p,
          id: l.paperId,
          pubDate: p.firstPublicationDate,
          ...tierOf(p),
          species: deriveSpecies(p.meshHeadings),
          isRetracted: isRetracted(p.pubTypes),
          firstMatchedAt: l.firstMatchedAt,
          isNew: f.newSince ? l.firstMatchedAt > f.newSince : false,
        };
      });

    const filtered = all.filter(
      (p) =>
        (!q ||
          stripHtml(`${p.title ?? ""} ${p.abstract ?? ""}`)
            .toLowerCase()
            .includes(q)) &&
        (f.tiers.length === 0 || f.tiers.includes(p.tier)) &&
        (!f.from || (p.pubDate ?? "") >= f.from) &&
        (f.species === "any" ||
          (f.species === "no-animal" && p.species !== "animal") ||
          (f.species === "human" && p.species === "human")) &&
        (f.preprints === "include" ||
          (f.preprints === "exclude" && !p.isPreprint) ||
          (f.preprints === "only" && p.isPreprint)) &&
        (!f.openAccessOnly || p.isOpenAccess === true) &&
        (!f.hideRetracted || !p.isRetracted) &&
        (!f.newOnly || p.isNew),
    );

    const byDate = (a: FeedPaper, b: FeedPaper) => (b.pubDate ?? "").localeCompare(a.pubDate ?? "");
    filtered.sort((a, b) => {
      if (f.sort === "tier") return tierRank(a.tier) - tierRank(b.tier) || byDate(a, b);
      if (f.sort === "cited")
        return (b.citedByCount ?? -1) - (a.citedByCount ?? -1) || byDate(a, b);
      return byDate(a, b);
    });

    const start = (f.page - 1) * f.pageSize;
    return {
      items: filtered.slice(start, start + f.pageSize),
      total: filtered.length,
      searchTotal: all.length,
      newCount: all.filter((p) => p.isNew).length,
      page: f.page,
      pageSize: f.pageSize,
    };
  },
};
