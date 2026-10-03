import {
  type FeedSort,
  type PreprintFilter,
  type SpeciesFilter,
  type Tier,
  tierLabels,
  tiers,
} from "@enzyme/shared";
import { ChevronDown, ChevronUp, ListFilter, Search, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type FeedFilters, SINCE_LABELS, type Since, sinces } from "@/lib/feed-filters";

const SORT_LABELS: Record<FeedSort, string> = {
  newest: "Newest first",
  tier: "Strongest evidence first",
  cited: "Most cited first",
};

const SPECIES_LABELS: Record<SpeciesFilter, string> = {
  any: "Humans and animals",
  "no-animal": "Hide animal-only",
  human: "Humans only (confirmed)",
};

const PREPRINT_LABELS: Record<PreprintFilter, string> = {
  include: "Include preprints",
  exclude: "Hide preprints",
  only: "Only preprints",
};

export function FeedToolbar({
  filters,
  setFilters,
  reset,
  isDefault,
  newCount,
  shown,
  total,
  searchTotal,
  allExpanded,
  onToggleAll,
}: {
  filters: FeedFilters;
  setFilters: (patch: Partial<FeedFilters>) => void;
  reset: () => void;
  isDefault: boolean;
  newCount: number;
  shown: number;
  total: number;
  searchTotal: number;
  allExpanded: boolean;
  onToggleAll: () => void;
}) {
  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (filters.q)
    chips.push({ key: "q", label: `“${filters.q}”`, remove: () => setFilters({ q: "" }) });
  for (const t of filters.tiers)
    chips.push({
      key: t,
      label: tierLabels[t],
      remove: () => setFilters({ tiers: filters.tiers.filter((x) => x !== t) }),
    });
  if (filters.since)
    chips.push({
      key: "since",
      label: SINCE_LABELS[filters.since],
      remove: () => setFilters({ since: "" }),
    });
  if (filters.species !== "any")
    chips.push({
      key: "species",
      label: SPECIES_LABELS[filters.species],
      remove: () => setFilters({ species: "any" }),
    });
  if (filters.preprints !== "include")
    chips.push({
      key: "pp",
      label: PREPRINT_LABELS[filters.preprints],
      remove: () => setFilters({ preprints: "include" }),
    });
  if (filters.openAccessOnly)
    chips.push({
      key: "oa",
      label: "Open access",
      remove: () => setFilters({ openAccessOnly: false }),
    });
  if (filters.showRetracted)
    chips.push({
      key: "r",
      label: "Showing retracted",
      remove: () => setFilters({ showRetracted: false }),
    });

  return (
    <div className="sticky top-0 z-10 border-b bg-page/95 backdrop-blur">
      <div className="mx-auto max-w-[960px] px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchBox value={filters.q} onChange={(q) => setFilters({ q })} />
          <Tabs
            value={filters.newOnly ? "new" : "all"}
            onValueChange={(v) => setFilters({ newOnly: v === "new" })}
          >
            <TabsList className="bg-stone-200/60">
              <TabsTrigger value="all" className="px-3">
                All
              </TabsTrigger>
              <TabsTrigger value="new" className="px-3">
                New{newCount > 0 ? ` (${newCount})` : ""}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={filters.sort} onValueChange={(v) => setFilters({ sort: v as FeedSort })}>
            <SelectTrigger size="sm" className="ml-auto bg-white text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SORT_LABELS).map(([v, label]) => (
                <SelectItem key={v} value={v}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select
            value={filters.since || "any"}
            onValueChange={(v) => setFilters({ since: (v === "any" ? "" : v) as Since })}
          >
            <SelectTrigger size="sm" className="bg-white text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sinces.map((s) => (
                <SelectItem key={s || "any"} value={s || "any"}>
                  {SINCE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <TierPicker value={filters.tiers} onChange={(t) => setFilters({ tiers: t })} />
          <Select
            value={filters.species}
            onValueChange={(v) => setFilters({ species: v as SpeciesFilter })}
          >
            <SelectTrigger size="sm" className="bg-white text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SPECIES_LABELS).map(([v, label]) => (
                <SelectItem key={v} value={v}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.preprints}
            onValueChange={(v) => setFilters({ preprints: v as PreprintFilter })}
          >
            <SelectTrigger size="sm" className="bg-white text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PREPRINT_LABELS).map(([v, label]) => (
                <SelectItem key={v} value={v}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Separator orientation="vertical" className="mx-1 h-4" />
          <SwitchLabel
            label="Open access only"
            checked={filters.openAccessOnly}
            onChange={(v) => setFilters({ openAccessOnly: v })}
          />
          <SwitchLabel
            label="Show retracted"
            checked={filters.showRetracted}
            onChange={(v) => setFilters({ showRetracted: v })}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-2 text-muted-foreground text-sm">
              {isDefault && !filters.newOnly ? (
                <>
                  <span className="font-medium text-foreground">{searchTotal}</span> papers
                </>
              ) : (
                <>
                  <span className="font-medium text-foreground">{total}</span> of {searchTotal}{" "}
                  papers
                </>
              )}
              {shown < total && ` · showing ${shown}`}
            </span>
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={c.remove}
                className="inline-flex h-6 items-center gap-1 rounded-full bg-stone-100 px-2.5 text-stone-700 text-xs hover:bg-stone-200"
              >
                {c.label}
                <X className="size-3" />
              </button>
            ))}
            {chips.length > 0 && (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="text-muted-foreground"
                onClick={reset}
              >
                Clear filters
              </Button>
            )}
          </div>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="text-muted-foreground"
            onClick={onToggleAll}
          >
            {allExpanded ? <ChevronUp /> : <ChevronDown />}
            {allExpanded ? "Collapse all" : "Expand all"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Typing updates the URL after a pause, not on every key. */
function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const t = setTimeout(() => onChange(draft), 300);
    return () => clearTimeout(t);
  }, [draft, value, onChange]);

  return (
    <div className="relative min-w-[220px] max-w-[420px] flex-1">
      <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-4 text-muted-foreground" />
      <Input
        placeholder="Search titles and abstracts…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="bg-white pr-8 pl-8"
      />
      {draft && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setDraft("");
            onChange("");
          }}
          className="-translate-y-1/2 absolute top-1/2 right-2 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function TierPicker({ value, onChange }: { value: Tier[]; onChange: (t: Tier[]) => void }) {
  const idPrefix = useId();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="bg-white text-xs">
          <ListFilter />
          Study type{value.length ? ` (${value.length})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="flex flex-col gap-1.5">
          {tiers.map((t) => (
            <label
              key={t}
              htmlFor={`${idPrefix}-${t}`}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <Checkbox
                id={`${idPrefix}-${t}`}
                checked={value.includes(t)}
                onCheckedChange={(on) =>
                  onChange(on ? [...value, t] : value.filter((x) => x !== t))
                }
              />
              {tierLabels[t]}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SwitchLabel({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-1.5 text-muted-foreground text-xs"
    >
      <Switch id={id} size="sm" checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  );
}
