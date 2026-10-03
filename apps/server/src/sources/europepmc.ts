import type { FullTextUrl, PaperInput } from "@enzyme/shared";

/**
 * Europe PMC REST search client.
 * Docs: https://europepmc.org/RestfulWebService — no API key, JSON, cursor pagination.
 *
 * Quirks verified live (2026-10-03):
 * - Request errors come back as HTTP 200 with `{ errCode, errMsg }` instead of results
 *   (empty query, pageSize outside 1..1000).
 * - Malformed query syntax (`AND`, unknown fields, unbalanced brackets) is NOT an error:
 *   it returns 0 hits or is silently repaired. A bad query can't be told from a narrow one.
 * - An unrecognised cursorMark returns HTTP 503.
 */

export const EUROPE_PMC_SEARCH_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
const MAX_QUERY_LENGTH = 1500;
const MAX_PAGE_SIZE = 1000;

export type EuropePmcErrorKind = "invalid_request" | "upstream";

export class EuropePmcError extends Error {
  constructor(
    message: string,
    /** `invalid_request`: the caller's input is at fault (map to 400). `upstream`: the API failed. */
    readonly kind: EuropePmcErrorKind,
    readonly status?: number,
  ) {
    super(message);
    this.name = "EuropePmcError";
  }
}

export interface EuropePmcRecord {
  paper: PaperInput;
  /** The untouched API record, kept so later re-mapping or card extraction needs no refetch. */
  raw: unknown;
}

export interface SearchPage {
  hitCount: number;
  records: EuropePmcRecord[];
  /** Pass back as `cursorMark` for the next page; `null` when there are no more pages. */
  nextCursorMark: string | null;
}

export interface SearchOptions {
  cursorMark?: string;
  pageSize?: number;
  /** Adds `HAS_ABSTRACT:y` unless the query already mentions it. Default `true`. */
  requireAbstract?: boolean;
}

export interface SearchAllOptions {
  /** Stop after this many records. Default 500. */
  maxRecords?: number;
  pageSize?: number;
  requireAbstract?: boolean;
  /** Called after each page, e.g. for pull progress. */
  onPage?: (progress: { hitCount: number; fetched: number }) => void;
}

export interface EuropePmcClientOptions {
  fetch?: typeof fetch;
  baseUrl?: string;
  /** Minimum gap between requests. Default 200 ms (~5 req/s). */
  minIntervalMs?: number;
  /** Retries after the first attempt on 429, 5xx, timeouts and network errors. Default 3. */
  maxRetries?: number;
  /** First retry delay; doubles each retry. Default 500 ms. */
  retryBaseMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface EuropePmcClient {
  search(query: string, options?: SearchOptions): Promise<SearchPage>;
  searchAll(query: string, options?: SearchAllOptions): AsyncGenerator<EuropePmcRecord>;
}

/** Wraps the user's query in brackets so an `OR` in it can't swallow the abstract filter. */
export function buildQuery(query: string, requireAbstract = true): string {
  const trimmed = query.trim();
  if (!trimmed) throw new EuropePmcError("Search query is empty", "invalid_request");
  const full =
    requireAbstract && !/\bHAS_ABSTRACT\s*:/i.test(trimmed)
      ? `(${trimmed}) AND HAS_ABSTRACT:y`
      : trimmed;
  if (full.length > MAX_QUERY_LENGTH) {
    throw new EuropePmcError(
      `Search query is too long (${full.length} characters; Europe PMC allows ${MAX_QUERY_LENGTH})`,
      "invalid_request",
    );
  }
  return full;
}

export function createEuropePmcClient(options: EuropePmcClientOptions = {}): EuropePmcClient {
  const {
    fetch: fetchFn = fetch,
    baseUrl = EUROPE_PMC_SEARCH_URL,
    minIntervalMs = 200,
    maxRetries = 3,
    retryBaseMs = 500,
    timeoutMs = 30_000,
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  } = options;

  let nextRequestAt = 0;

  async function throttle() {
    const wait = nextRequestAt - Date.now();
    nextRequestAt = Math.max(nextRequestAt, Date.now()) + minIntervalMs;
    if (wait > 0) await sleep(wait);
  }

  async function getJson(url: string): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      await throttle();
      let failure: EuropePmcError;
      try {
        const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
        if (res.ok) return await res.json();
        const retryable = res.status === 429 || res.status >= 500;
        failure = new EuropePmcError(
          `Europe PMC responded ${res.status} ${res.statusText}`.trim(),
          retryable ? "upstream" : "invalid_request",
          res.status,
        );
        if (!retryable) throw failure;
      } catch (err) {
        if (err instanceof EuropePmcError) throw err;
        // Network error, timeout or unparseable body: worth another try.
        failure = new EuropePmcError(`Europe PMC request failed: ${errorMessage(err)}`, "upstream");
      }
      if (attempt >= maxRetries) throw failure;
      await sleep(retryBaseMs * 2 ** attempt);
    }
  }

  async function search(query: string, opts: SearchOptions = {}): Promise<SearchPage> {
    const pageSize = opts.pageSize ?? 100;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw new EuropePmcError(`pageSize must be 1..${MAX_PAGE_SIZE}`, "invalid_request");
    }
    const cursorMark = opts.cursorMark ?? "*";
    const params = new URLSearchParams({
      query: buildQuery(query, opts.requireAbstract),
      format: "json",
      resultType: "core",
      pageSize: String(pageSize),
      cursorMark,
    });
    const body = asObject(await getJson(`${baseUrl}?${params}`));

    // Errors arrive with HTTP 200 and an error body instead of results.
    if (body.errMsg !== undefined || body.errCode !== undefined) {
      throw new EuropePmcError(
        str(body.errMsg) ?? `Europe PMC error ${String(body.errCode)}`,
        "invalid_request",
      );
    }
    const results = asObject(body.resultList).result;
    if (!Array.isArray(results)) {
      throw new EuropePmcError("Europe PMC response has no resultList", "upstream");
    }

    const next = str(body.nextCursorMark);
    return {
      hitCount: num(body.hitCount) ?? 0,
      records: results.map((raw) => ({ paper: mapEuropePmcRecord(raw), raw })),
      nextCursorMark: results.length > 0 && next && next !== cursorMark ? next : null,
    };
  }

  async function* searchAll(
    query: string,
    opts: SearchAllOptions = {},
  ): AsyncGenerator<EuropePmcRecord> {
    const maxRecords = opts.maxRecords ?? 500;
    const pageSize = opts.pageSize ?? 100;
    let cursorMark: string | null = "*";
    let fetched = 0;

    while (cursorMark && fetched < maxRecords) {
      const page = await search(query, {
        cursorMark,
        pageSize: Math.min(pageSize, maxRecords - fetched),
        requireAbstract: opts.requireAbstract,
      });
      const records = page.records.slice(0, maxRecords - fetched);
      fetched += records.length;
      opts.onPage?.({ hitCount: page.hitCount, fetched });
      yield* records;
      cursorMark = page.nextCursorMark;
    }
  }

  return { search, searchAll };
}

/** Shared default client, so all callers share one throttle. */
export const europePmc = createEuropePmcClient();

/**
 * Maps one Europe PMC `resultType=core` record to a `PaperInput`. Tolerates any shape:
 * missing or malformed fields become `null`. Throws only if the record has no `id`/`source`.
 */
export function mapEuropePmcRecord(raw: unknown): PaperInput {
  const r = asObject(raw);
  const source = str(r.source);
  const sourceId = str(r.id);
  if (!source || !sourceId) {
    throw new EuropePmcError("Europe PMC record has no id/source", "upstream");
  }
  const journalInfo = asObject(r.journalInfo);

  return {
    source,
    sourceId,
    pmid: str(r.pmid),
    pmcid: str(r.pmcid),
    doi: str(r.doi),
    title: str(r.title),
    abstract: str(r.abstractText),
    authors: str(r.authorString),
    journal:
      str(asObject(journalInfo.journal).title) ?? str(asObject(r.bookOrReportDetails).publisher),
    firstPublicationDate: isoDate(r.firstPublicationDate),
    pubYear: int(r.pubYear),
    pubTypes: strList(asObject(r.pubTypeList).pubType),
    meshHeadings: list(asObject(r.meshHeadingList).meshHeading, (h) =>
      str(asObject(h).descriptorName),
    ),
    keywords: strList(asObject(r.keywordList).keyword),
    citedByCount: int(r.citedByCount),
    isOpenAccess: yesNo(r.isOpenAccess),
    fullTextUrls: list(asObject(r.fullTextUrlList).fullTextUrl, toFullTextUrl),
    isPreprint: source === "PPR",
  };
}

function toFullTextUrl(value: unknown): FullTextUrl | null {
  const u = asObject(value);
  const url = str(u.url);
  if (!url) return null;
  return {
    url,
    site: str(u.site),
    availability: str(u.availability),
    documentStyle: str(u.documentStyle),
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string | null {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function num(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function int(value: unknown): number | null {
  const n = num(value);
  return n !== null && Number.isInteger(n) ? n : null;
}

function yesNo(value: unknown): boolean | null {
  if (value === "Y") return true;
  if (value === "N") return false;
  return null;
}

function isoDate(value: unknown): string | null {
  const s = str(value);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Europe PMC sometimes collapses a one-item list to the bare item. */
function list<T>(value: unknown, map: (item: unknown) => T | null): T[] | null {
  if (value === undefined || value === null) return null;
  const items = Array.isArray(value) ? value : [value];
  return items.map(map).filter((item): item is T => item !== null);
}

function strList(value: unknown): string[] | null {
  return list(value, str);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.name === "TimeoutError" ? "timed out" : err.message;
  }
  return String(err);
}
