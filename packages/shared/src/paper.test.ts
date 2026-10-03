import { describe, expect, it } from "vitest";
import { stripHtml } from "./html.js";
import { type PaperInput, paperInputSchema } from "./paper.js";

const minimal: PaperInput = {
  source: "PPR",
  sourceId: "PPR1",
  pmid: null,
  pmcid: null,
  doi: null,
  title: null,
  abstract: null,
  authors: null,
  journal: null,
  firstPublicationDate: null,
  pubYear: null,
  pubTypes: null,
  meshHeadings: null,
  keywords: null,
  citedByCount: null,
  isOpenAccess: null,
  fullTextUrls: null,
  isPreprint: true,
};

describe("paperInputSchema", () => {
  it("accepts a paper where everything but the key is unknown", () => {
    expect(paperInputSchema.parse(minimal)).toEqual(minimal);
  });

  it("rejects a paper without a source id", () => {
    expect(paperInputSchema.safeParse({ ...minimal, sourceId: "" }).success).toBe(false);
  });
});

describe("stripHtml", () => {
  it("drops inline tags without adding spaces", () => {
    expect(stripHtml("CO<sub>2</sub> and <i>Drosophila</i>")).toBe("CO2 and Drosophila");
  });

  it("separates block tags so headings don't glue to the text", () => {
    expect(stripHtml("<h4>Background</h4>Sleep matters.<br/>More.")).toBe(
      "Background Sleep matters. More.",
    );
  });

  it("decodes entities", () => {
    expect(stripHtml("A &amp; B &lt;5 mg&gt; &#946; &#x3b1;")).toBe("A & B <5 mg> β α");
  });
});
