import type { FeedPage, FeedQuery, PullRun, SavedSearch, SavedSearchInput } from "@enzyme/shared";

/**
 * Everything the UI needs from the API for searches, pulls and the feed. Implemented by the
 * mock today; the real implementation wraps the typed Hono client (`./api`) with the same
 * signatures, so components and hooks don't change.
 *
 * Endpoint each method maps to (T-4/T-5):
 * - listSearches     GET    /api/searches
 * - createSearch     POST   /api/searches
 * - updateSearch     PUT    /api/searches/:id
 * - deleteSearch     DELETE /api/searches/:id
 * - markViewed       POST   /api/searches/:id/viewed   -> { previousViewedAt }
 * - startPull        POST   /api/searches/:id/pull     -> PullRun (202)
 * - getLatestRun     GET    /api/searches/:id/pull     -> PullRun | null
 * - getFeed          GET    /api/searches/:id/papers?<FeedQuery>
 */
export interface EnzymeApi {
  listSearches(): Promise<SavedSearch[]>;
  createSearch(input: SavedSearchInput): Promise<SavedSearch>;
  updateSearch(id: number, input: SavedSearchInput): Promise<SavedSearch>;
  deleteSearch(id: number): Promise<void>;
  markViewed(id: number): Promise<{ previousViewedAt: string | null }>;
  startPull(id: number): Promise<PullRun>;
  getLatestRun(id: number): Promise<PullRun | null>;
  getFeed(id: number, query: FeedQuery): Promise<FeedPage>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
