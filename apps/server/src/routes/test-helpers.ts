import type { PaperInput } from "@enzyme/shared";
import { createApp } from "../app.js";
import { createDb, type Db, migrateDb } from "../db/client.js";
import type { EuropePmcClient, EuropePmcRecord } from "../sources/europepmc.js";

let nextId = 1;

/** A minimal stored-paper shape; override what the test is about. */
export function paper(overrides: Partial<PaperInput> = {}): PaperInput {
  const id = String(nextId++);
  return {
    source: "MED",
    sourceId: id,
    pmid: id,
    pmcid: null,
    doi: null,
    title: `Paper ${id}`,
    abstract: "Abstract text.",
    authors: "Doe J.",
    journal: "Journal",
    firstPublicationDate: "2026-01-01",
    pubYear: 2026,
    pubTypes: ["Journal Article"],
    meshHeadings: null,
    keywords: null,
    citedByCount: 0,
    isOpenAccess: false,
    fullTextUrls: null,
    isPreprint: false,
    ...overrides,
  };
}

/**
 * Europe PMC stand-in: `results[query]` are the records it "finds", served in pages of
 * `pageSize`. `gate` (when set) is awaited before each page so a test can hold a pull open.
 */
export function fakeEuropePmc(results: Record<string, PaperInput[]>) {
  const fake = {
    calls: [] as string[],
    gate: null as Promise<void> | null,
    fail: null as Error | null,
    pageSize: 2,
    async *searchAll(
      query: string,
      opts: Parameters<EuropePmcClient["searchAll"]>[1] = {},
    ): AsyncGenerator<EuropePmcRecord> {
      fake.calls.push(query);
      const all = results[query] ?? [];
      const max = opts.maxRecords ?? 500;
      let fetched = 0;
      do {
        if (fake.gate) await fake.gate;
        if (fake.fail) throw fake.fail;
        const page = all.slice(fetched, Math.min(fetched + fake.pageSize, max));
        fetched += page.length;
        opts.onPage?.({ hitCount: all.length, fetched });
        for (const p of page) yield { paper: p, raw: { id: p.sourceId } };
      } while (fetched < Math.min(all.length, max));
    },
  };
  return fake;
}

/** The app on a fresh in-memory database, with helpers to call it and wait for pulls. */
export function testApp(results: Record<string, PaperInput[]> = {}) {
  const db: Db = createDb(":memory:");
  migrateDb(db);
  const europePmc = fakeEuropePmc(results);
  const pulls: Promise<void>[] = [];
  const app = createApp({
    db,
    europePmc,
    logRequests: false,
    onPullStarted: (done) => pulls.push(done),
  });

  async function call<T = unknown>(method: string, path: string, body?: unknown) {
    const res = await app.request(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
  }

  return {
    db,
    app,
    europePmc,
    call,
    /** Waits for every pull started so far. */
    settlePulls: () => Promise.all(pulls),
  };
}
