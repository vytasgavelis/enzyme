import type { SavedSearch } from "@enzyme/shared";
import { useQueryClient } from "@tanstack/react-query";
import { FlaskConical, LoaderCircle, Plus, RotateCcw } from "lucide-react";
import { useState } from "react";
import { NavLink, useMatch, useNavigate } from "react-router";
import { Pill } from "@/components/pill";
import { Button } from "@/components/ui/button";
import { resetMockData } from "@/lib/mock-api";
import { enzymeApi, useSearches } from "@/lib/queries";
import { SearchDialog } from "./search-dialog";

export function Sidebar() {
  const searches = useSearches();
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  // The open search shows its new papers in the feed; counting them here as well only confuses.
  const activeId = Number(useMatch("/searches/:searchId")?.params.searchId);
  const newCount = (s: SavedSearch) => (s.id === activeId ? 0 : s.newCount);
  const totalNew = searches.data?.reduce((n, s) => n + newCount(s), 0) ?? 0;

  return (
    <aside className="flex min-h-0 flex-col border-r bg-white">
      <div className="flex items-center gap-2 px-5 pt-4 pb-3">
        <FlaskConical className="size-[18px] text-green-700" />
        <h1 className="font-semibold text-lg">Enzyme</h1>
        {totalNew > 0 && (
          <Pill tone="green" className="ml-auto rounded-full">
            {totalNew} new
          </Pill>
        )}
      </div>

      <div className="flex items-center justify-between px-5 pb-1">
        <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.06em]">
          Searches
        </span>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => setAdding(true)}
        >
          <Plus /> New
        </Button>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4">
        {searches.data?.map((s) => (
          <SearchRow key={s.id} search={s} newCount={newCount(s)} />
        ))}
        {searches.data?.length === 0 && (
          <p className="px-2 py-3 text-muted-foreground text-sm">
            No searches yet. Add one to start collecting papers.
          </p>
        )}
      </nav>

      <div className="flex items-center justify-between border-t px-5 py-2.5 text-muted-foreground text-xs">
        <span>Prototype · mock data</span>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => {
            resetMockData();
            sessionStorage.clear();
            // Full reload so no in-memory state (query cache, mark-viewed calls) survives.
            window.location.assign("/");
          }}
        >
          <RotateCcw /> Reset
        </Button>
      </div>

      <SearchDialog
        open={adding}
        onOpenChange={setAdding}
        onSaved={async (s) => {
          await enzymeApi.startPull(s.id);
          await qc.invalidateQueries({ queryKey: ["searches"] });
          navigate(`/searches/${s.id}`);
        }}
      />
    </aside>
  );
}

function SearchRow({ search, newCount }: { search: SavedSearch; newCount: number }) {
  const pulling = search.lastRun?.status === "running";
  return (
    <NavLink
      to={`/searches/${search.id}`}
      className={({ isActive }) =>
        `flex h-8 items-center justify-between gap-2 rounded-md px-2 text-sm transition-colors ${
          isActive ? "bg-green-50 font-medium text-green-800" : "hover:bg-muted"
        }`
      }
    >
      <span className="truncate">{search.name}</span>
      <span className="flex shrink-0 items-center gap-2">
        {pulling && <LoaderCircle className="size-3.5 animate-spin text-blue-600" />}
        {newCount > 0 && (
          <Pill tone="green" kind="solid" className="min-w-5 justify-center rounded-full">
            {newCount}
          </Pill>
        )}
        <span className="text-muted-foreground text-xs tabular-nums">{search.paperCount}</span>
      </span>
    </NavLink>
  );
}
