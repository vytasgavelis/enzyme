import { LoaderCircle, Pencil, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { SearchDialog } from "@/features/searches/search-dialog";
import { toFeedQuery, useFeedFilters } from "@/lib/feed-filters";
import { useFeed, useNewSince, usePull, useSearches, useSummariseMany } from "@/lib/queries";
import { FeedToolbar } from "./feed-toolbar";
import { PaperRow } from "./paper-row";
import { PullStatus } from "./pull-status";

/** Papers "Summarise top N" takes from the top of the current, filtered feed (T-8). */
const SUMMARISE_TOP = 10;

function SummariseTop({
  ids,
  running,
  progress,
  onRun,
}: {
  ids: number[];
  running: boolean;
  progress: { done: number; failed: number; total: number } | null;
  onRun: (ids: number[]) => void;
}) {
  if (running && progress) {
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <LoaderCircle className="size-3.5 animate-spin" />
        Summarising {progress.done} of {progress.total}…
      </span>
    );
  }
  const batch = ids.slice(0, SUMMARISE_TOP);
  return (
    <div className="flex items-center gap-2">
      {progress && progress.failed > 0 && (
        <span className="text-red-700 text-xs">{progress.failed} failed</span>
      )}
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="bg-white"
        disabled={batch.length === 0}
        onClick={() => onRun(batch)}
        title="Generate key facts for the first papers in the feed below that don't have them yet"
      >
        <Sparkles />
        {batch.length === 0 ? "All shown are summarised" : `Summarise top ${batch.length}`}
      </Button>
    </div>
  );
}

export function FeedPage() {
  const id = Number(useParams().searchId);
  const searches = useSearches();
  const search = searches.data?.find((s) => s.id === id);

  if (searches.isPending) return null;
  if (!search) return <Navigate to="/" replace />;
  // Keyed so expanded rows and the "new" cut-off reset when switching searches.
  return <Feed key={id} searchId={id} />;
}

function Feed({ searchId }: { searchId: number }) {
  const navigate = useNavigate();
  const search = useSearches().data?.find((s) => s.id === searchId);
  const { filters, setFilters, reset, isDefault } = useFeedFilters();
  const { ready, newSince } = useNewSince(searchId);
  const { run, start } = usePull(searchId);
  const summarise = useSummariseMany();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const query = useMemo(
    () => ({ ...toFeedQuery(filters), newSince: newSince ?? undefined }),
    [filters, newSince],
  );
  const feed = useFeed(searchId, query, ready);

  const pages = feed.data?.pages ?? [];
  const items = pages.flatMap((p) => p.items);
  const first = pages[0];
  const allExpanded = items.length > 0 && items.every((p) => expanded.has(p.id));

  const toggle = (paperId: number) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(paperId)) n.delete(paperId);
      else n.add(paperId);
      return n;
    });

  if (!search) return null;
  const neverPulled = run === null && search.paperCount === 0;

  return (
    <>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-[960px] items-start justify-between gap-6 px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-semibold text-xl">{search.name}</h2>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => setEditing(true)}
              >
                <Pencil /> Edit
              </Button>
            </div>
            {search.intent && <p className="mt-1 text-sm text-stone-700">{search.intent}</p>}
            <p className="mt-1 break-words font-mono text-stone-600 text-xs">{search.query}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <PullStatus run={run} starting={start.isPending} onPull={() => start.mutate()} />
            <SummariseTop
              ids={items.filter((p) => !p.card && p.abstract).map((p) => p.id)}
              running={summarise.running}
              progress={summarise.progress}
              onRun={(ids) => summarise.run(ids)}
            />
          </div>
        </div>
      </header>

      <FeedToolbar
        filters={filters}
        setFilters={setFilters}
        reset={reset}
        isDefault={isDefault}
        newCount={first?.newCount ?? 0}
        shown={items.length}
        total={first?.total ?? 0}
        searchTotal={first?.searchTotal ?? 0}
        allExpanded={allExpanded}
        onToggleAll={() => setExpanded(new Set(allExpanded ? [] : items.map((p) => p.id)))}
      />

      <div className="mx-auto max-w-[960px] px-6 pt-4 pb-24">
        <div className="flex flex-col gap-2">
          {items.map((p) => (
            <PaperRow
              key={p.id}
              paper={p}
              expanded={expanded.has(p.id)}
              onToggle={() => toggle(p.id)}
            />
          ))}
        </div>

        {feed.isPending && (
          <div className="flex justify-center py-12 text-muted-foreground">
            <LoaderCircle className="animate-spin" />
          </div>
        )}

        {first && items.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-white py-12 text-center">
            {neverPulled || first.searchTotal === 0 ? (
              run?.status === "running" ? (
                <span className="text-muted-foreground">
                  Papers will appear here as they arrive…
                </span>
              ) : (
                <>
                  <span className="text-muted-foreground">No papers yet for this search.</span>
                  <Button type="button" size="sm" onClick={() => start.mutate()}>
                    Pull papers
                  </Button>
                </>
              )
            ) : filters.newOnly && first.newCount === 0 ? (
              <span className="text-muted-foreground">Nothing new since your last visit.</span>
            ) : (
              <>
                <span className="text-muted-foreground">No papers match these filters.</span>
                <Button type="button" size="xs" variant="secondary" onClick={reset}>
                  Clear filters
                </Button>
              </>
            )}
          </div>
        )}

        {feed.hasNextPage && (
          <div className="mt-4 flex justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-white"
              onClick={() => feed.fetchNextPage()}
              disabled={feed.isFetchingNextPage}
            >
              {feed.isFetchingNextPage && <LoaderCircle className="animate-spin" />}
              Show more ({(first?.total ?? 0) - items.length} left)
            </Button>
          </div>
        )}
      </div>

      <SearchDialog
        open={editing}
        onOpenChange={setEditing}
        search={search}
        onSaved={(_, queryChanged) => {
          if (queryChanged) start.mutate();
        }}
        onDeleted={() => navigate("/")}
      />
    </>
  );
}
