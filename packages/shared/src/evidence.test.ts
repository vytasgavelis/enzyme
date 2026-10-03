import { describe, expect, it } from "vitest";
import { deriveSpecies, deriveTier, isRetracted } from "./evidence.js";

const tierOf = (pubTypes: string[] | null, title: string | null = null) =>
  deriveTier(pubTypes, title).tier;

describe("deriveTier", () => {
  it("picks the strongest tier among the publication types", () => {
    expect(tierOf(["Randomized Controlled Trial", "Meta-Analysis", "Journal Article"])).toBe(
      "meta-analysis",
    );
    expect(tierOf(["Clinical Trial, Phase III", "Randomized Controlled Trial"])).toBe("rct");
  });

  it("treats MEDLINE and JATS spellings alike", () => {
    expect(tierOf(["systematic-review"])).toBe("systematic-review");
    expect(tierOf(["Systematic Review"])).toBe("systematic-review");
    expect(tierOf(["review-article", "Journal Article"])).toBe("review");
    expect(tierOf(["case-report"])).toBe("case-report");
    expect(tierOf(["Case Reports"])).toBe("case-report");
  });

  it("falls back to other", () => {
    expect(tierOf(["research-article", "Journal Article"])).toBe("other");
    expect(tierOf(["Preprint"])).toBe("other");
    expect(tierOf(null)).toBe("other");
  });

  it("guesses from the title only when the publication types say nothing", () => {
    const title =
      "An Examination into the Anti-stress Effects of an Ashwagandha Extract in Stressed Adults: A Randomised, Double-Blind, Placebo-controlled Trial.";
    expect(deriveTier(["research-article"], title)).toEqual({ tier: "rct", fromTitle: true });
    expect(deriveTier(["Review"], title)).toEqual({ tier: "review", fromTitle: false });
    expect(tierOf(["Preprint"], "Creatine and memory: a systematic review and meta-analysis")).toBe(
      "meta-analysis",
    );
    expect(tierOf(["research-article"], "Magnesium and sleep in mice")).toBe("other");
  });
});

describe("deriveSpecies", () => {
  it("is human when MeSH has Humans, even alongside Animals", () => {
    expect(deriveSpecies(["Humans", "Animals", "Sleep"])).toBe("human");
  });

  it("is animal when MeSH has Animals but not Humans", () => {
    expect(deriveSpecies(["Animals", "Rats", "Magnesium"])).toBe("animal");
  });

  it("is unknown without MeSH (preprints, not yet indexed)", () => {
    expect(deriveSpecies(null)).toBe("unknown");
    expect(deriveSpecies([])).toBe("unknown");
    expect(deriveSpecies(["Magnesium"])).toBe("unknown");
  });
});

describe("isRetracted", () => {
  it("matches the Retracted Publication type", () => {
    expect(isRetracted(["Journal Article", "Retracted Publication"])).toBe(true);
    expect(isRetracted(["Retraction of Publication"])).toBe(false);
    expect(isRetracted(null)).toBe(false);
  });
});
