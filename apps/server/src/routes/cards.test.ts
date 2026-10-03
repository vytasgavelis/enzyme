import type { FeedPage, PaperCard } from "@enzyme/shared";
import { describe, expect, it } from "vitest";
import { ModelError } from "../ai/card-agent.js";
import { upsertPaper } from "../db/papers.js";
import { savedSearches, searchPapers } from "../db/schema.js";
import { paper, testApp, unknownCard } from "./test-helpers.js";

const ABSTRACT =
  "<h4>Methods</h4>We randomised 120 adults with insomnia to 500 mg magnesium or placebo for 8 weeks. <h4>Results</h4>Sleep latency fell by 12 minutes (p = 0.01).";

function setup(abstract: string | null = ABSTRACT) {
  const t = testApp();
  const { id } = upsertPaper(t.db, paper({ abstract }), {});
  return { ...t, id };
}

describe("POST /api/papers/:id/card", () => {
  it("sends plain text to the model and stores the checked card", async () => {
    const t = setup();
    t.model.respond = () =>
      unknownCard({
        sampleSize: { quote: "120 adults", value: "120 adults", status: "stated" },
        doseOrRegimen: { quote: "500 mg magnesium", value: "500 mg", status: "stated" },
        resultDirection: { quote: "Sleep latency fell", value: "Improved", status: "stated" },
      });

    const res = await t.call<PaperCard>("POST", `/api/papers/${t.id}/card`);

    expect(res.status).toBe(201);
    expect(t.model.calls[0]?.abstract).toBe(
      "Methods We randomised 120 adults with insomnia to 500 mg magnesium or placebo for 8 weeks. Results Sleep latency fell by 12 minutes (p = 0.01).",
    );
    const { card } = res.body;
    expect(card.sampleSize).toEqual({ value: "120 adults", quote: "120 adults", status: "stated" });
    expect(card.resultDirection.value).toBe("improved");
    expect(card.fundingOrCoi).toEqual({ value: null, quote: null, status: "unknown" });
    expect(res.body).toMatchObject({ modelId: "fake/model", latencyMs: 12, inputTokens: 100 });

    const got = await t.call<PaperCard>("GET", `/api/papers/${t.id}/card`);
    expect(got.body).toEqual(res.body);
  });

  it("marks fields whose quote is not in the abstract as suspect", async () => {
    const t = setup();
    t.model.respond = () =>
      unknownCard({
        fundingOrCoi: { quote: "Funded by Acme Corp", value: "Acme", status: "stated" },
        duration: { quote: null, value: "8 weeks", status: "stated" },
        resultDirection: { quote: "Sleep latency fell", value: "better", status: "stated" },
      });

    const { body } = await t.call<PaperCard>("POST", `/api/papers/${t.id}/card`);

    expect(body.card.fundingOrCoi.status).toBe("suspect");
    expect(body.card.duration.status).toBe("suspect");
    expect(body.card.resultDirection.status).toBe("suspect");
  });

  it("accepts quotes from the title", async () => {
    const t = testApp();
    const { id } = upsertPaper(
      t.db,
      paper({ title: "Magnesium for sleep: a <i>meta-analysis</i>", abstract: ABSTRACT }),
      {},
    );
    t.model.respond = () =>
      unknownCard({
        design: { quote: "a meta-analysis", value: "meta-analysis", status: "stated" },
      });

    const { body } = await t.call<PaperCard>("POST", `/api/papers/${id}/card`);

    expect(t.model.calls[0]?.title).toBe("Magnesium for sleep: a meta-analysis");
    expect(body.card.design.status).toBe("stated");
  });

  it("regenerating replaces the current card", async () => {
    const t = setup();
    await t.call("POST", `/api/papers/${t.id}/card`);
    t.model.respond = () => unknownCard({ takeaway: "Second." });
    await t.call("POST", `/api/papers/${t.id}/card`);

    const got = await t.call<PaperCard>("GET", `/api/papers/${t.id}/card`);
    expect(got.body.card.takeaway).toBe("Second.");
  });

  it("joins a request for a paper whose card is already being generated", async () => {
    const t = setup();
    let open = () => {};
    t.model.gate = new Promise((r) => {
      open = r;
    });
    const a = t.call("POST", `/api/papers/${t.id}/card`);
    const b = t.call("POST", `/api/papers/${t.id}/card`);
    await new Promise((r) => setTimeout(r, 0));
    open();
    expect((await a).status).toBe(201);
    expect((await b).status).toBe(201);
    expect(t.model.calls).toHaveLength(1);
  });

  it("answers 422 without an abstract, 404 for an unknown paper", async () => {
    const t = setup(null);
    expect((await t.call("POST", `/api/papers/${t.id}/card`)).status).toBe(422);
    expect((await t.call("POST", "/api/papers/999/card")).status).toBe(404);
    expect((await t.call("GET", `/api/papers/${t.id}/card`)).status).toBe(404);
    expect(t.model.calls).toHaveLength(0);
  });

  it("passes model errors through with their status", async () => {
    const t = setup();
    t.model.fail = new ModelError("rate limited", 429);
    const res = await t.call<{ error: string }>("POST", `/api/papers/${t.id}/card`);
    expect(res).toEqual({ status: 429, body: { error: "rate limited" } });
  });
});

describe("feed", () => {
  it("includes each paper's current card", async () => {
    const t = setup();
    const other = upsertPaper(t.db, paper(), {}).id;
    const search = t.db.insert(savedSearches).values({ name: "s", query: "s" }).returning().get();
    t.db
      .insert(searchPapers)
      .values([
        { searchId: search.id, paperId: t.id },
        { searchId: search.id, paperId: other },
      ])
      .run();
    await t.call("POST", `/api/papers/${t.id}/card`);

    const feed = await t.call<FeedPage>("GET", `/api/searches/${search.id}/papers`);
    const byId = new Map(feed.body.items.map((p) => [p.id, p]));
    expect(byId.get(t.id)?.card?.card.takeaway).toBe("Takeaway.");
    expect(byId.get(other)?.card).toBeNull();
  });
});
