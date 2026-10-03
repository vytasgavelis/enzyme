import type {
  FeedPage,
  FeedQuery,
  PaperCard,
  PullRun,
  SavedSearch,
  SavedSearchInput,
} from "@enzyme/shared";

/**
 * Everything the UI needs from the API for searches, pulls and the feed. `./http-api` implements
 * it over the typed Hono client; `./mock-api` in the browser (`VITE_MOCK_API=1`).
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
 * - generateCard     POST   /api/papers/:id/card       -> PaperCard (201), the paper's new card
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
  generateCard(paperId: number): Promise<PaperCard>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
