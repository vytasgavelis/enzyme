import { paperInputSchema } from "@enzyme/shared";
import { describe, expect, it, vi } from "vitest";
import fixture from "./__fixtures__/europepmc-search-core.json" with { type: "json" };
import {
  buildQuery,
  createEuropePmcClient,
  EuropePmcError,
  mapEuropePmcRecord,
} from "./europepmc.js";

// Fixture: real `resultType=core` records recorded 2026-10-03 for "peptides AND sleep":
// two MEDLINE papers (one with <sub> in the abstract), an open-access RCT with a PMCID,
// and a bioRxiv preprint.
const [medline, withHtml, openAccessRct, preprint] = fixture.resultList.result;

describe("mapEuropePmcRecord", () => {
  it("maps every field of a MEDLINE record", () => {
    expect(mapEuropePmcRecord(medline)).toEqual({
      source: "MED",
      sourceId: "42715944",
      pmid: "42715944",
      pmcid: null,
      doi: "10.1021/acs.jafc.6c03771",
      title: expect.stringMatching(/^Novel Sleep-Promoting Peptides from Sea Cucumbers/),
      abstract: expect.stringMatching(/^The study aimed to screen novel sleep-promoting/),
      authors: "Sun Y, Li Y, Ren M, Jin Y, Zhang M, Wu T.",
      journal: "Journal of agricultural and food chemistry",
      firstPublicationDate: "2026-09-01",
      pubYear: 2026,
      pubTypes: ["Journal Article"],
      meshHeadings: expect.arrayContaining(["Animals", "Humans", "Mice", "Sea Cucumbers"]),
      keywords: expect.arrayContaining(["Molecular docking", "Sea Cucumber Oligopeptides"]),
      citedByCount: 0,
      isOpenAccess: false,
      fullTextUrls: [
        {
          url: "https://doi.org/10.1021/acs.jafc.6c03771",
          site: "DOI",
          availability: "Subscription required",
          documentStyle: "doi",
        },
      ],
      isPreprint: false,
    });
  });

  it("maps an open-access RCT with PMCID and full-text links", () => {
    const paper = mapEuropePmcRecord(openAccessRct);
    expect(paper.pmcid).toBe("PMC13516771");
    expect(paper.isOpenAccess).toBe(true);
    expect(paper.pubTypes).toContain("Randomized Controlled Trial");
    expect(paper.fullTextUrls).toContainEqual({
      url: "https://europepmc.org/articles/PMC13516771?pdf=render",
      site: "Europe_PMC",
      availability: "Open access",
      documentStyle: "pdf",
    });
  });

  it("maps a preprint: no PMID or MeSH, server name as journal", () => {
    expect(mapEuropePmcRecord(preprint)).toMatchObject({
      source: "PPR",
      sourceId: "PPR1262876",
      pmid: null,
      journal: "bioRxiv",
      meshHeadings: null,
      keywords: null,
      isPreprint: true,
    });
  });

  it("keeps HTML in the abstract", () => {
    expect(mapEuropePmcRecord(withHtml).abstract).toContain("<sub>");
  });

  it("produces output that satisfies the shared schema", () => {
    for (const raw of fixture.resultList.result) {
      expect(paperInputSchema.safeParse(mapEuropePmcRecord(raw)).success).toBe(true);
    }
  });

  it("turns missing and malformed fields into null instead of crashing", () => {
    const paper = mapEuropePmcRecord({
      id: "X1",
      source: "AGR",
      title: "   ",
      pubYear: "n/a",
      citedByCount: "lots",
      isOpenAccess: "maybe",
      firstPublicationDate: "2026",
      journalInfo: "not an object",
      pubTypeList: { pubType: "Review" },
      meshHeadingList: { meshHeading: [{ majorTopic_YN: "N" }, { descriptorName: "Sleep" }] },
      fullTextUrlList: { fullTextUrl: [{ site: "DOI" }] },
    });
    expect(paper).toMatchObject({
      sourceId: "X1",
      title: null,
      abstract: null,
      journal: null,
      pubYear: null,
      citedByCount: null,
      isOpenAccess: null,
      firstPublicationDate: null,
      pubTypes: ["Review"],
      meshHeadings: ["Sleep"],
      fullTextUrls: [],
      isPreprint: false,
    });
  });

  it("rejects a record with no id", () => {
    expect(() => mapEuropePmcRecord({ source: "MED" })).toThrow(EuropePmcError);
  });
});

describe("buildQuery", () => {
  it("brackets the query before adding the abstract filter", () => {
    expect(buildQuery("peptides OR sleep")).toBe("(peptides OR sleep) AND HAS_ABSTRACT:y");
  });

  it("leaves the query alone if it already filters on abstracts or the filter is off", () => {
    expect(buildQuery("sleep AND has_abstract:n")).toBe("sleep AND has_abstract:n");
    expect(buildQuery(" sleep ", false)).toBe("sleep");
  });

  it("rejects empty and over-long queries as invalid requests", () => {
    expect(() => buildQuery("  ")).toThrow(expect.objectContaining({ kind: "invalid_request" }));
    expect(() => buildQuery("a".repeat(1500))).toThrow(/too long/);
  });
});

/** A Europe PMC response page holding `ids.length` minimal records. */
function page(ids: string[], nextCursorMark?: string, hitCount = 7) {
  return {
    hitCount,
    nextCursorMark,
    resultList: { result: ids.map((id) => ({ id, source: "MED", pmid: id })) },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function testClient(responses: Array<Response | Error>) {
  const fetch = vi.fn(async (_url: string | URL | Request) => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra request");
    if (next instanceof Error) throw next;
    return next;
  });
  const sleep = vi.fn(async (_ms: number) => {});
  const client = createEuropePmcClient({
    fetch: fetch as unknown as typeof globalThis.fetch,
    sleep,
    minIntervalMs: 0,
  });
  const requestedParams = (call: number) =>
    new URL(String(fetch.mock.calls[call]?.[0])).searchParams;
  return { client, fetch, sleep, requestedParams };
}

async function collect<T>(gen: AsyncGenerator<T>) {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

describe("search", () => {
  it("requests core results and returns mapped records with raw kept", async () => {
    const { client, requestedParams } = testClient([jsonResponse(fixture)]);
    const result = await client.search("peptides AND sleep", { pageSize: 4 });

    expect(Object.fromEntries(requestedParams(0))).toEqual({
      query: "(peptides AND sleep) AND HAS_ABSTRACT:y",
      format: "json",
      resultType: "core",
      pageSize: "4",
      cursorMark: "*",
    });
    expect(result.hitCount).toBe(fixture.hitCount);
    expect(result.nextCursorMark).toBe(fixture.nextCursorMark);
    expect(result.records.map((r) => r.paper.sourceId)).toEqual([
      "42715944",
      "42692736",
      "42654319",
      "PPR1262876",
    ]);
    expect(result.records[0]?.raw).toEqual(medline);
  });

  it("surfaces Europe PMC's error message, which arrives with HTTP 200", async () => {
    const { client } = testClient([
      jsonResponse({ errCode: 404, errMsg: "No search criteria provided." }),
    ]);
    await expect(client.search("x")).rejects.toMatchObject({
      name: "EuropePmcError",
      kind: "invalid_request",
      message: "No search criteria provided.",
    });
  });

  it("retries 5xx and network errors with backoff, then succeeds", async () => {
    const { client, fetch, sleep } = testClient([
      jsonResponse({}, 503),
      new TypeError("fetch failed"),
      jsonResponse(page(["1"])),
    ]);
    const result = await client.search("sleep");
    expect(result.records).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([500, 1000]);
  });

  it("gives up after maxRetries as an upstream error", async () => {
    const { client, fetch } = testClient(Array.from({ length: 4 }, () => jsonResponse({}, 502)));
    await expect(client.search("sleep")).rejects.toMatchObject({ kind: "upstream", status: 502 });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("does not retry other 4xx responses", async () => {
    const { client, fetch } = testClient([jsonResponse({}, 400)]);
    await expect(client.search("sleep")).rejects.toMatchObject({
      kind: "invalid_request",
      status: 400,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects page sizes Europe PMC doesn't accept without calling it", async () => {
    const { client, fetch } = testClient([]);
    await expect(client.search("sleep", { pageSize: 1001 })).rejects.toThrow(/pageSize/);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("searchAll", () => {
  it("follows the cursor until the last page", async () => {
    const { client, requestedParams } = testClient([
      jsonResponse(page(["1", "2", "3"], "c1")),
      jsonResponse(page(["4", "5", "6"], "c2")),
      jsonResponse(page(["7"], "c2")), // last page repeats its own cursor
    ]);
    const onPage = vi.fn();
    const records = await collect(client.searchAll("sleep", { pageSize: 3, onPage }));

    expect(records.map((r) => r.paper.sourceId)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect([0, 1, 2].map((i) => requestedParams(i).get("cursorMark"))).toEqual(["*", "c1", "c2"]);
    expect(onPage).toHaveBeenLastCalledWith({ hitCount: 7, fetched: 7 });
  });

  it("stops at maxRecords and shrinks the last page request", async () => {
    const { client, fetch, requestedParams } = testClient([
      jsonResponse(page(["1", "2", "3"], "c1")),
      jsonResponse(page(["4", "5"], "c2")),
    ]);
    const records = await collect(client.searchAll("sleep", { pageSize: 3, maxRecords: 5 }));

    expect(records).toHaveLength(5);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(requestedParams(1).get("pageSize")).toBe("2");
  });

  it("stops on an empty page", async () => {
    const { client, fetch } = testClient([jsonResponse(page([], "c1", 0))]);
    expect(await collect(client.searchAll("sleep"))).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
