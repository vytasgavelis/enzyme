import type { FeedQuery } from "@enzyme/shared";
import { type ClientResponse, DetailedError, parseResponse } from "hono/client";
import { api } from "./api";
import { ApiError, type EnzymeApi } from "./enzyme-api";

const searches = api.api.searches;
const param = (id: number) => ({ param: { id: String(id) } });

/**
 * The typed body of a 2xx response. Anything else becomes an `ApiError` carrying the
 * server's `{ error }` message, which the UI shows as is.
 */
async function ok<T extends ClientResponse<unknown>>(res: Promise<T>) {
  try {
    return await parseResponse(res);
  } catch (err) {
    if (!(err instanceof DetailedError)) throw err;
    const message = (err.detail?.data as { error?: string } | undefined)?.error;
    throw new ApiError(err.statusCode ?? 0, message ?? err.message);
  }
}

/**
 * Query params as strings, with `tiers` repeated; undefined ones are left out. Booleans and
 * numbers become "true"/"25", which `feedQuerySchema` parses back.
 */
function feedParams(query: FeedQuery): Record<string, string | string[]> {
  const params: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    params[key] = Array.isArray(value) ? value.map(String) : String(value);
  }
  return params;
}

/** `EnzymeApi` over HTTP, via the typed Hono client. See `enzyme-api.ts` for the endpoint map. */
export const httpApi: EnzymeApi = {
  listSearches: () => ok(searches.$get()),
  createSearch: (input) => ok(searches.$post({ json: input })),
  updateSearch: (id, input) => ok(searches[":id"].$put({ ...param(id), json: input })),
  async deleteSearch(id) {
    await ok(searches[":id"].$delete(param(id)));
  },
  markViewed: (id) => ok(searches[":id"].viewed.$post(param(id))),
  startPull: (id) => ok(searches[":id"].pull.$post(param(id))),
  getLatestRun: (id) => ok(searches[":id"].pull.$get(param(id))),
  getFeed: (id, query) =>
    ok(searches[":id"].papers.$get({ ...param(id), query: feedParams(query) })),
};
