import {
  type FeedQuery,
  type FeedSort,
  feedSorts,
  type PreprintFilter,
  preprintFilters,
  type SpeciesFilter,
  speciesFilters,
  type Tier,
  tiers,
} from "@enzyme/shared";
import { useSearchParams } from "react-router";
import { daysAgo } from "./format";

export const sinces = ["", "30d", "1y", "5y"] as const;
export type Since = (typeof sinces)[number];

export const SINCE_LABELS: Record<Since, string> = {
  "": "Any time",
  "30d": "Past 30 days",
  "1y": "Past year",
  "5y": "Past 5 years",
};

const SINCE_DAYS: Record<Exclude<Since, "">, number> = { "30d": 30, "1y": 365, "5y": 5 * 365 };

/** The API query for these filters (page and newSince are added by the caller). */
export function toFeedQuery(f: FeedFilters): FeedQuery {
  return {
    q: f.q,
    tiers: f.tiers,
    from: f.since ? daysAgo(SINCE_DAYS[f.since]) : undefined,
    species: f.species,
    preprints: f.preprints,
    openAccessOnly: f.openAccessOnly,
    hideRetracted: !f.showRetracted,
    newOnly: f.newOnly,
    sort: f.sort,
  };
}

/** Feed filters as the UI holds them. Lives in the URL so reloads and links keep it. */
export interface FeedFilters {
  q: string;
  tiers: Tier[];
  since: Since;
  species: SpeciesFilter;
  preprints: PreprintFilter;
  openAccessOnly: boolean;
  showRetracted: boolean;
  newOnly: boolean;
  sort: FeedSort;
}

export const DEFAULT_FILTERS: FeedFilters = {
  q: "",
  tiers: [],
  since: "",
  species: "any",
  preprints: "include",
  openAccessOnly: false,
  showRetracted: false,
  newOnly: false,
  sort: "newest",
};

const oneOf = <T extends string>(values: readonly T[], v: string | null, fallback: T): T =>
  values.includes(v as T) ? (v as T) : fallback;

export function useFeedFilters() {
  const [params, setParams] = useSearchParams();

  const filters: FeedFilters = {
    q: params.get("q") ?? "",
    tiers: (params.get("tiers") ?? "")
      .split(",")
      .filter((t): t is Tier => tiers.includes(t as Tier)),
    since: oneOf(sinces, params.get("since"), ""),
    species: oneOf(speciesFilters, params.get("species"), "any"),
    preprints: oneOf(preprintFilters, params.get("preprints"), "include"),
    openAccessOnly: params.get("oa") === "1",
    showRetracted: params.get("retracted") === "1",
    newOnly: params.get("new") === "1",
    sort: oneOf(feedSorts, params.get("sort"), "newest"),
  };

  const setFilters = (patch: Partial<FeedFilters>) => {
    const next = { ...filters, ...patch };
    const p = new URLSearchParams();
    if (next.q) p.set("q", next.q);
    if (next.tiers.length) p.set("tiers", next.tiers.join(","));
    if (next.since) p.set("since", next.since);
    if (next.species !== "any") p.set("species", next.species);
    if (next.preprints !== "include") p.set("preprints", next.preprints);
    if (next.openAccessOnly) p.set("oa", "1");
    if (next.showRetracted) p.set("retracted", "1");
    if (next.newOnly) p.set("new", "1");
    if (next.sort !== "newest") p.set("sort", next.sort);
    setParams(p, { replace: true });
  };

  const isDefault = JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS);
  return { filters, setFilters, reset: () => setParams({}, { replace: true }), isDefault };
}
