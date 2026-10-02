import { describe, expect, it } from "vitest";
import { paperInputSchema } from "./paper.js";

describe("paperInputSchema", () => {
  it("accepts a minimal paper", () => {
    expect(paperInputSchema.parse({ pmid: "1", title: "t" })).toEqual({ pmid: "1", title: "t" });
  });

  it("rejects an empty pmid", () => {
    expect(paperInputSchema.safeParse({ pmid: "", title: "t" }).success).toBe(false);
  });
});
