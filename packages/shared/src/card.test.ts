import { describe, expect, it } from "vitest";
import { quoteInText } from "./card.js";

describe("quoteInText", () => {
  const text = "We gave 500 mg/day of magnesium – or placebo – to “older” adults.";

  it("ignores case, spacing, quote and dash variants, and a trailing full stop", () => {
    expect(quoteInText(text, "500 mg/day of magnesium")).toBe(true);
    expect(quoteInText(text, "MAGNESIUM  - or placebo")).toBe(true);
    expect(quoteInText(text, '"older" adults.')).toBe(true);
  });

  it("checks each part of a quote joined with an ellipsis", () => {
    expect(quoteInText(text, "We gave ... or placebo")).toBe(true);
    expect(quoteInText(text, "We gave […] older")).toBe(true);
    expect(quoteInText(text, "We gave ... aspirin")).toBe(false);
  });

  it("rejects paraphrases and empty quotes", () => {
    expect(quoteInText(text, "500 mg of magnesium daily")).toBe(false);
    expect(quoteInText(text, " ")).toBe(false);
    expect(quoteInText(text, "...")).toBe(false);
  });
});
