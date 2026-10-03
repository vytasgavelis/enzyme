import type { FeedPage, FeedQuery, PaperCard, SavedSearchInput } from "@enzyme/shared";
import {
  type InfiniteData,
  keepPreviousData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EnzymeApi } from "./enzyme-api";
import { httpApi } from "./http-api";
import { mockApi } from "./mock-api";

/** `VITE_MOCK_API=1` runs the UI on the in-browser mock instead of the server. */
export const usingMockApi = import.meta.env.VITE_MOCK_API === "1";
export const enzymeApi: EnzymeApi = usingMockApi ? mockApi : httpApi;

const keys = {
  searches: ["searches"] as const,
  feed: (id: number) => ["feed", id] as const,
  run: (id: number) => ["run", id] as const,
  allFeeds: ["feed"] as const,
  card: ["card"] as const,
};

export function useSearches() {
  return useQuery({ queryKey: keys.searches, queryFn: () => enzymeApi.listSearches() });
}

export function useSaveSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: number; input: SavedSearchInput }) =>
      id === undefined ? enzymeApi.createSearch(input) : enzymeApi.updateSearch(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.searches }),
  });
}

export function useDeleteSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => enzymeApi.deleteSearch(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.searches }),
  });
}

const newSinceKey = (id: number) => `enzyme:newSince:${id}`;

/** One mark-viewed call per search per session, even when effects run twice (StrictMode). */
const newSinceCalls = new Map<number, Promise<string | null>>();

function loadNewSince(id: number): Promise<string | null> {
  const stored = sessionStorage.getItem(newSinceKey(id));
  if (stored !== null) return Promise.resolve(stored || null);
  let call = newSinceCalls.get(id);
  if (!call) {
    call = enzymeApi.markViewed(id).then(({ previousViewedAt }) => {
      sessionStorage.setItem(newSinceKey(id), previousViewedAt ?? "");
      return previousViewedAt;
    });
    newSinceCalls.set(id, call);
  }
  return call;
}

/**
 * Marks the search viewed when it is opened and returns the cut-off for "new" markers: the
 * previous `lastViewedAt`. The cut-off is kept for the browser session, so markers survive
 * reloads and switching between searches, and reset next session.
 */
export function useNewSince(id: number) {
  const qc = useQueryClient();
  const [state, setState] = useState<{ id: number; newSince: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadNewSince(id).then((newSince) => {
      if (!cancelled) setState({ id, newSince });
      qc.invalidateQueries({ queryKey: keys.searches });
    });
    return () => {
      cancelled = true;
    };
  }, [id, qc]);

  return { ready: state?.id === id, newSince: state?.id === id ? state.newSince : null };
}

export function useFeed(id: number, query: FeedQuery, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: [...keys.feed(id), query],
    queryFn: ({ pageParam }) => enzymeApi.getFeed(id, { ...query, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Latest pull for a search; polls while it runs and refreshes the feed when it finishes. */
export function usePull(id: number) {
  const qc = useQueryClient();
  const run = useQuery({
    queryKey: keys.run(id),
    queryFn: () => enzymeApi.getLatestRun(id),
    refetchInterval: (q) => (q.state.data?.status === "running" ? 500 : false),
  });

  const start = useMutation({
    mutationFn: () => enzymeApi.startPull(id),
    onSuccess: (r) => qc.setQueryData(keys.run(id), r),
  });

  // While running, refresh the feed and counts as papers arrive (EN-22), and once at the end.
  const status = run.data?.status;
  const fetched = run.data?.fetched;
  const prevStatus = useRef(status);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `fetched` is the trigger, not an input
  useEffect(() => {
    if (status === "running" || prevStatus.current === "running") {
      qc.invalidateQueries({ queryKey: keys.feed(id) });
      qc.invalidateQueries({ queryKey: keys.searches });
    }
    prevStatus.current = status;
  }, [status, fetched, id, qc]);

  return { run: run.data ?? null, start };
}

/** Puts a new card into every cached feed page that shows the paper. */
function patchCard(qc: QueryClient, card: PaperCard) {
  qc.setQueriesData<InfiniteData<FeedPage>>({ queryKey: keys.allFeeds }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((p) => (p.id === card.paperId ? { ...p, card } : p)),
          })),
        }
      : data,
  );
}

/** Generates (or regenerates) a paper's study card; `mutate(paperId)`. */
export function useGenerateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: keys.card,
    mutationFn: (paperId: number) => enzymeApi.generateCard(paperId),
    onSuccess: (card) => patchCard(qc, card),
  });
}

/** Whether a card is being generated for the paper, by its row or a batch, and the last error. */
export function useCardStatus(paperId: number) {
  const states = useMutationState({
    filters: { mutationKey: keys.card, predicate: (m) => m.state.variables === paperId },
    select: (m) => ({ status: m.state.status, error: m.state.error }),
  });
  const latest = states.at(-1);
  return {
    pending: latest?.status === "pending",
    error: latest?.status === "error" ? (latest.error?.message ?? "Failed") : null,
  };
}

/** Cards generated at once by "Summarise top N": 10 took ~50 s at 4 on the free tier (2026-10-04). */
const BATCH_CONCURRENCY = 4;

/**
 * Generates cards for a list of papers a few at a time (T-8). Each finished card appears in
 * its row straight away; `progress` counts them for the button.
 */
export function useSummariseMany() {
  const { mutateAsync } = useGenerateCard();
  const [progress, setProgress] = useState<{ done: number; failed: number; total: number } | null>(
    null,
  );

  const run = useCallback(
    async (paperIds: number[]) => {
      const queue = [...paperIds];
      let done = 0;
      let failed = 0;
      setProgress({ done, failed, total: paperIds.length });
      const worker = async () => {
        for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
          try {
            await mutateAsync(id);
          } catch {
            failed++;
          }
          done++;
          setProgress({ done, failed, total: paperIds.length });
        }
      };
      await Promise.all(Array.from({ length: BATCH_CONCURRENCY }, worker));
    },
    [mutateAsync],
  );

  const running = progress !== null && progress.done < progress.total;
  return { run, running, progress };
}
