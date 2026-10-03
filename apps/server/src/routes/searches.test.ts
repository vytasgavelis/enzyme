import type { PullRun, SavedSearch } from "@enzyme/shared";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { pullRuns, savedSearches, searchPapers } from "../db/schema.js";
import { failInterruptedRuns } from "../db/searches.js";
import { paper, testApp } from "./test-helpers.js";

const peptides = [paper(), paper(), paper(), paper(), paper()];

async function createSearch(t: ReturnType<typeof testApp>, name: string, query = "") {
  const res = await t.call<SavedSearch>("POST", "/api/searches", { name, query });
  expect(res.status).toBe(201);
  return res.body;
}

async function pull(t: ReturnType<typeof testApp>, id: number) {
  const started = await t.call<PullRun>("POST", `/api/searches/${id}/pull`);
  expect(started.status).toBe(202);
  await t.settlePulls();
  return (await t.call<PullRun>("GET", `/api/searches/${id}/pull`)).body;
}

describe("saved searches CRUD", () => {
  it("creates a search and uses the name as the query when the query is empty", async () => {
    const t = testApp();
    const s = await createSearch(t, "magnesium sleep");
    expect(s).toMatchObject({
      name: "magnesium sleep",
      query: "magnesium sleep",
      lastRunAt: null,
      lastViewedAt: null,
      paperCount: 0,
      newCount: 0,
      lastRun: null,
    });
    expect(new Date(s.createdAt).toISOString()).toBe(s.createdAt);

    const list = await t.call<SavedSearch[]>("GET", "/api/searches");
    expect(list.body).toEqual([s]);
  });

  it("rejects a missing name and an over-long query with a readable 400", async () => {
    const t = testApp();
    const noName = await t.call<{ error: string }>("POST", "/api/searches", { name: " " });
    expect(noName.status).toBe(400);
    expect(noName.body.error).toContain("Give the search a name");

    const long = await t.call<{ error: string }>("POST", "/api/searches", {
      name: "long",
      query: "x".repeat(1600),
    });
    expect(long.status).toBe(400);
    expect(long.body.error).toMatch(/too long/);
  });

  it("updates name and query, keeping papers the old query matched", async () => {
    const t = testApp({ "peptides AND sleep": peptides });
    const s = await createSearch(t, "Peptides", "peptides AND sleep");
    await pull(t, s.id);

    const res = await t.call<SavedSearch>("PUT", `/api/searches/${s.id}`, {
      name: "BPC-157",
      query: "",
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "BPC-157", query: "BPC-157", paperCount: 5 });
  });

  it("deletes a search with its links and runs, but keeps the papers", async () => {
    const t = testApp({ q: peptides });
    const s = await createSearch(t, "q");
    await pull(t, s.id);

    expect((await t.call("DELETE", `/api/searches/${s.id}`)).status).toBe(204);
    expect((await t.call<SavedSearch[]>("GET", "/api/searches")).body).toEqual([]);
    expect(t.db.select().from(searchPapers).all()).toEqual([]);
    expect(t.db.select().from(pullRuns).all()).toEqual([]);
    expect((await t.call<unknown[]>("GET", "/api/papers")).body).toHaveLength(5);
  });

  it("answers 404 for unknown searches and 400 for non-numeric ids", async () => {
    const t = testApp();
    expect((await t.call("PUT", "/api/searches/9", { name: "x" })).status).toBe(404);
    expect((await t.call("DELETE", "/api/searches/9")).status).toBe(404);
    expect((await t.call("POST", "/api/searches/9/viewed")).status).toBe(404);
    expect((await t.call("POST", "/api/searches/9/pull")).status).toBe(404);
    expect((await t.call("GET", "/api/searches/9/pull")).status).toBe(404);
    expect((await t.call("GET", "/api/searches/9/papers")).status).toBe(404);
    expect((await t.call("GET", "/api/searches/abc/papers")).status).toBe(400);
  });
});

describe("mark viewed and newCount", () => {
  it("returns the previous lastViewedAt and counts papers matched since then", async () => {
    const t = testApp({ q: peptides });
    const s = await createSearch(t, "q");
    await pull(t, s.id);

    // Never viewed: nothing counts as new.
    let [listed] = (await t.call<SavedSearch[]>("GET", "/api/searches")).body;
    expect(listed?.newCount).toBe(0);

    const first = await t.call<{ previousViewedAt: string | null }>(
      "POST",
      `/api/searches/${s.id}/viewed`,
    );
    expect(first.body).toEqual({ previousViewedAt: null });

    const second = await t.call<{ previousViewedAt: string | null }>(
      "POST",
      `/api/searches/${s.id}/viewed`,
    );
    [listed] = (await t.call<SavedSearch[]>("GET", "/api/searches")).body;
    expect(second.body.previousViewedAt).not.toBeNull();
    expect(listed?.lastViewedAt).not.toBeNull();

    // Two papers matched after the last visit.
    const later = new Date(Date.now() + 60_000);
    t.db
      .update(searchPapers)
      .set({ firstMatchedAt: later })
      .where(eq(searchPapers.paperId, 1))
      .run();
    t.db
      .update(searchPapers)
      .set({ firstMatchedAt: later })
      .where(eq(searchPapers.paperId, 2))
      .run();
    [listed] = (await t.call<SavedSearch[]>("GET", "/api/searches")).body;
    expect(listed?.newCount).toBe(2);
  });
});

describe("pull", () => {
  it("fetches, inserts and links papers; a second pull inserts nothing (T-4 acceptance)", async () => {
    const t = testApp({ "peptides AND sleep": peptides });
    const s = await createSearch(t, "Peptides", "peptides AND sleep");

    expect((await t.call("GET", `/api/searches/${s.id}/pull`)).body).toBeNull();

    const started = await t.call<PullRun>("POST", `/api/searches/${s.id}/pull`);
    expect(started.status).toBe(202);
    expect(started.body).toMatchObject({ status: "running", fetched: 0, finishedAt: null });

    await t.settlePulls();
    const first = (await t.call<PullRun>("GET", `/api/searches/${s.id}/pull`)).body;
    expect(first).toMatchObject({
      status: "succeeded",
      hitCount: 5,
      target: 5,
      fetched: 5,
      inserted: 5,
      newMatches: 5,
      error: null,
    });
    expect(first.finishedAt).not.toBeNull();
    expect(t.europePmc.calls).toEqual(["peptides AND sleep"]);

    const second = await pull(t, s.id);
    expect(second).toMatchObject({ status: "succeeded", fetched: 5, inserted: 0, newMatches: 0 });
    expect(second.id).not.toBe(first.id);

    const [listed] = (await t.call<SavedSearch[]>("GET", "/api/searches")).body;
    expect(listed).toMatchObject({ paperCount: 5, lastRunAt: second.finishedAt });
    expect(listed?.lastRun).toEqual(second);
  });

  it("counts papers another search already stored as new matches, not inserts", async () => {
    const t = testApp({ a: peptides.slice(0, 3), b: peptides });
    const a = await createSearch(t, "a");
    const b = await createSearch(t, "b");
    await pull(t, a.id);
    expect(await pull(t, b.id)).toMatchObject({ fetched: 5, inserted: 2, newMatches: 5 });
  });

  it("reports progress while running and returns the running run on a second start", async () => {
    const t = testApp({ q: peptides });
    const s = await createSearch(t, "q");
    let open!: () => void;
    t.europePmc.gate = new Promise((resolve) => {
      open = resolve;
    });

    const first = await t.call<PullRun>("POST", `/api/searches/${s.id}/pull`);
    const again = await t.call<PullRun>("POST", `/api/searches/${s.id}/pull`);
    expect(again.status).toBe(202);
    expect(again.body.id).toBe(first.body.id);
    expect(t.europePmc.calls).toHaveLength(1);

    const [listed] = (await t.call<SavedSearch[]>("GET", "/api/searches")).body;
    expect(listed?.lastRun).toMatchObject({ id: first.body.id, status: "running" });

    t.europePmc.gate = null;
    open();
    await t.settlePulls();
    expect((await t.call<PullRun>("GET", `/api/searches/${s.id}/pull`)).body.status).toBe(
      "succeeded",
    );
  });

  it("caps target at PULL_CAP", async () => {
    const many = Array.from({ length: 503 }, () => paper());
    const t = testApp({ q: many });
    t.europePmc.pageSize = 100;
    const s = await createSearch(t, "q");
    expect(await pull(t, s.id)).toMatchObject({ hitCount: 503, target: 500, fetched: 500 });
  });

  it("marks the run failed with the error, keeping what was stored", async () => {
    const t = testApp({ q: peptides });
    const s = await createSearch(t, "q");
    t.europePmc.fail = new Error("Europe PMC responded 503 Service Unavailable");
    const run = await pull(t, s.id);
    expect(run).toMatchObject({
      status: "failed",
      error: "Europe PMC responded 503 Service Unavailable",
    });
    expect(run.finishedAt).not.toBeNull();
    const [listed] = (await t.call<SavedSearch[]>("GET", "/api/searches")).body;
    expect(listed?.lastRunAt).toBeNull();
  });

  it("fails runs left running by a previous process", async () => {
    const t = testApp();
    const s = await createSearch(t, "q");
    t.db.insert(pullRuns).values({ searchId: s.id }).run();
    expect(failInterruptedRuns(t.db)).toBe(1);
    const run = (await t.call<PullRun>("GET", `/api/searches/${s.id}/pull`)).body;
    expect(run).toMatchObject({ status: "failed", error: "Interrupted (server restarted)" });
  });

  it("survives the search being deleted mid-pull", async () => {
    const t = testApp({ q: peptides });
    const s = await createSearch(t, "q");
    let open!: () => void;
    t.europePmc.gate = new Promise((resolve) => {
      open = resolve;
    });
    await t.call("POST", `/api/searches/${s.id}/pull`);
    await t.call("DELETE", `/api/searches/${s.id}`);
    t.europePmc.gate = null;
    open();
    await t.settlePulls();
    expect(t.db.select().from(savedSearches).all()).toEqual([]);
  });
});
