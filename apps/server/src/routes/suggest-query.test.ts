import type { QuerySuggestion, SavedSearch } from "@enzyme/shared";
import { describe, expect, it } from "vitest";
import { ModelError } from "../ai/card-agent.js";
import { EuropePmcError } from "../sources/europepmc.js";
import { testApp } from "./test-helpers.js";

const URL = "/api/searches/suggest-query";

describe("POST /api/searches/suggest-query", () => {
  it("answers with the agent's query, the counted hits and the explanation only", async () => {
    const t = testApp();
    t.hits["probiotic* AND IBS"] = 40_000;
    t.hits['TITLE:probiotic* AND TITLE_ABS:"irritable bowel syndrome"'] = 1_369;
    t.queryModel.script = async (_intent, check) => {
      await check("probiotic* AND IBS");
      await check('TITLE:probiotic* AND TITLE_ABS:"irritable bowel syndrome"');
      return JSON.stringify({
        query: 'TITLE:probiotic* AND TITLE_ABS:"irritable bowel syndrome"',
        explanation: "Probiotic papers about IBS.",
      });
    };

    const res = await t.call<QuerySuggestion>("POST", URL, {
      intent: "  probiotics for irritable bowel syndrome ",
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      query: 'TITLE:probiotic* AND TITLE_ABS:"irritable bowel syndrome"',
      hitCount: 1_369,
      explanation: "Probiotic papers about IBS.",
    });
    expect(t.queryModel.intents).toEqual(["probiotics for irritable bowel syndrome"]);
  });

  it("rejects an empty intent with a readable 400", async () => {
    const t = testApp();
    const res = await t.call<{ error: string }>("POST", URL, { intent: "  " });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Describe what you are looking for");
    expect(t.queryModel.intents).toEqual([]);
  });

  it("passes the model's status through as { error }", async () => {
    const t = testApp();
    t.queryModel.fail = new ModelError("The model provider is rate limiting us.", 429);
    const res = await t.call<{ error: string }>("POST", URL, { intent: "gut health" });
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/rate limiting/);
  });

  it("answers 502 when the agent finds no usable query", async () => {
    const t = testApp();
    t.queryModel.script = async () => "Sorry.";
    const res = await t.call<{ error: string }>("POST", URL, { intent: "gut health" });
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/query/);
  });

  it("answers 502 when Europe PMC fails while counting", async () => {
    const t = testApp();
    t.queryModel.script = async () => {
      throw new EuropePmcError("Europe PMC responded 503", "upstream", 503);
    };
    const res = await t.call<{ error: string }>("POST", URL, { intent: "gut health" });
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/Europe PMC/);
  });
});

describe("saved search intent", () => {
  it("keeps the plain-English intent with the search, null when none", async () => {
    const t = testApp();
    const created = await t.call<SavedSearch>("POST", "/api/searches", {
      name: "Gut health",
      query: 'TITLE:"gut health"',
      intent: " gut health and the microbiome ",
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ intent: "gut health and the microbiome" });

    const updated = await t.call<SavedSearch>("PUT", `/api/searches/${created.body.id}`, {
      name: "Gut health",
      query: 'TITLE:"gut health"',
    });
    expect(updated.body.intent).toBeNull();
  });
});
