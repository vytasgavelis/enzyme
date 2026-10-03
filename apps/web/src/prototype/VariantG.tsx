/**
 * PROTOTYPE — Variant G: Variant F's design rebuilt on the current stack (shadcn/ui + Tailwind v4).
 * Same left sidebar (watchlist, query, ingestion, tags) and colour-coded compact feed as F; papers
 * expand into the plain summary, key facts ("study card") and abstract with provenance highlight.
 * Colours come from Tailwind's palette; the green accent overrides shadcn's --primary locally.
 * Throwaway; all state is local.
 */
import {
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  FlaskConical,
  Lightbulb,
  ListFilter,
  LoaderCircle,
  Pencil,
  Plus,
  Quote,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  TriangleAlert,
  X,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useId, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
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
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ALL_TAGS,
  applyFilters,
  CARD_FIELDS,
  cardValue,
  DEFAULT_FILTERS,
  type Direction,
  type Filters,
  FLAG_LABEL,
  type Flag,
  formatDate,
  INGESTION,
  PAPERS,
  type Paper,
  PUB_TYPES,
  type PubType,
  type StudyCard,
  sortPapers,
  TIER_LABEL,
  type Tier,
  UNKNOWN,
  WATCHLIST,
} from "./mock";

type SortBy = "date" | "tier" | "citations";
type Segment = "all" | "new" | "starred" | "card";
type Tone = "green" | "teal" | "blue" | "gray" | "orange" | "amber" | "red";
type Kind = "soft" | "solid" | "surface" | "outline";

/** Static class strings so Tailwind can see every colour. */
const TONE: Record<Tone, Record<Kind, string>> = {
  green: {
    soft: "bg-green-100 text-green-800",
    solid: "bg-green-600 text-white",
    surface: "bg-green-50 text-green-800 ring-1 ring-inset ring-green-300",
    outline: "text-green-700 ring-1 ring-inset ring-green-400",
  },
  teal: {
    soft: "bg-teal-100 text-teal-800",
    solid: "bg-teal-600 text-white",
    surface: "bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-300",
    outline: "text-teal-700 ring-1 ring-inset ring-teal-400",
  },
  blue: {
    soft: "bg-blue-100 text-blue-800",
    solid: "bg-blue-600 text-white",
    surface: "bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-300",
    outline: "text-blue-700 ring-1 ring-inset ring-blue-400",
  },
  gray: {
    soft: "bg-stone-100 text-stone-700",
    solid: "bg-stone-600 text-white",
    surface: "bg-stone-50 text-stone-700 ring-1 ring-inset ring-stone-300",
    outline: "text-stone-600 ring-1 ring-inset ring-stone-300",
  },
  orange: {
    soft: "bg-orange-100 text-orange-800",
    solid: "bg-orange-600 text-white",
    surface: "bg-orange-50 text-orange-800 ring-1 ring-inset ring-orange-300",
    outline: "text-orange-700 ring-1 ring-inset ring-orange-400",
  },
  amber: {
    soft: "bg-amber-100 text-amber-800",
    solid: "bg-amber-500 text-white",
    surface: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-300",
    outline: "text-amber-700 ring-1 ring-inset ring-amber-400",
  },
  red: {
    soft: "bg-red-100 text-red-800",
    solid: "bg-red-600 text-white",
    surface: "bg-red-50 text-red-800 ring-1 ring-inset ring-red-300",
    outline: "text-red-700 ring-1 ring-inset ring-red-400",
  },
};

const TIER_TONE: Record<Tier, Tone> = {
  1: "green",
  2: "teal",
  3: "blue",
  4: "gray",
  5: "orange",
  6: "gray",
};

const FLAG_TONE: Record<Flag, Tone> = {
  retracted: "red",
  preprint: "amber",
  "tiny-sample": "orange",
  "industry-funded": "orange",
  "animal-only": "amber",
};

const DIRECTION_TONE: Record<Direction, Tone> = {
  positive: "green",
  negative: "red",
  null: "gray",
  mixed: "amber",
};

const DIRECTION_LABEL: Record<Direction, string> = {
  positive: "↗ positive",
  negative: "↘ negative",
  null: "∅ no effect",
  mixed: "± mixed",
};

const SINCE_OPTIONS: { value: string; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "2026-09-03", label: "Past 30 days" },
  { value: "2026-07-03", label: "Past 3 months" },
  { value: "2026-01-01", label: "This year" },
];

const INGESTION_RUN_AT = WATCHLIST.reduce(
  (latest, w) => (w.lastRunAt > latest ? w.lastRunAt : latest),
  "1970-01-01T00:00:00Z",
);

/** Green accent + sage neutrals, scoped to this variant by overriding shadcn tokens. */
const THEME = {
  "--primary": "oklch(0.58 0.15 148)",
  "--primary-foreground": "oklch(0.99 0 0)",
  "--ring": "oklch(0.7 0.12 148)",
  "--border": "oklch(0.91 0.008 165)",
  "--input": "oklch(0.89 0.01 165)",
  "--muted": "oklch(0.96 0.006 165)",
  "--muted-foreground": "oklch(0.5 0.012 165)",
  "--accent": "oklch(0.95 0.01 165)",
} as CSSProperties;

function Pill({
  tone,
  kind = "soft",
  className = "",
  children,
}: {
  tone: Tone;
  kind?: Kind;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded px-1.5 font-medium text-xs [&_svg]:size-3 ${TONE[tone][kind]} ${className}`}
    >
      {children}
    </span>
  );
}

function Tip({ content, children }: { content: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{content}</TooltipContent>
    </Tooltip>
  );
}

function Highlighted({ text, quote }: { text: string; quote?: string }) {
  if (!quote) return <>{text}</>;
  const i = text.indexOf(quote);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-amber-200/70 px-0.5 text-inherit ring-1 ring-amber-300">
        {quote}
      </mark>
      {text.slice(i + quote.length)}
    </>
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

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex h-6 items-center gap-1 rounded-full bg-stone-100 px-2.5 text-stone-700 text-xs hover:bg-stone-200"
    >
      {label}
      <X className="size-3" />
    </button>
  );
}

function SectionLabel({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <div className="mb-1 flex items-center justify-between px-2">
      <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.06em]">
        {children}
      </span>
      {action}
    </div>
  );
}

function SidebarRow({
  on,
  label,
  right,
  onClick,
  tone = "green",
}: {
  on: boolean;
  label: ReactNode;
  right?: ReactNode;
  onClick: () => void;
  tone?: "green" | "amber";
}) {
  const active = tone === "green" ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-sm transition-colors ${
        on ? `${active} font-medium` : "text-foreground hover:bg-muted"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">{label}</span>
      <span className="flex shrink-0 items-center gap-2">{right}</span>
    </button>
  );
}

function CardStatusPill({ card }: { card?: StudyCard }) {
  if (!card) return <Pill tone="gray">no card</Pill>;
  return card.status === "verified" ? (
    <Pill tone="green">
      <BadgeCheck /> verified
    </Pill>
  ) : (
    <Pill tone="amber">draft</Pill>
  );
}

function StudyCardPanel({
  paper,
  card,
  onVerify,
}: {
  paper: Paper;
  card: StudyCard;
  onVerify: () => void;
}) {
  const [hover, setHover] = useState<keyof StudyCard | null>(null);
  const [pinned, setPinned] = useState<keyof StudyCard | null>(null);
  const active = hover ?? pinned;
  const quote = active ? card.provenance[active] : undefined;

  return (
    <div className="pt-3">
      <Separator className="mb-3" />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h4 className="font-semibold text-sm">Key facts</h4>
          <Tip content="The study card: structured facts the model extracted from the abstract. 'unknown' means the abstract does not say. Summaries are generated from these facts, not from the paper.">
            <span className="cursor-help text-muted-foreground text-xs">study card ⓘ</span>
          </Tip>
          {card.status === "verified" ? (
            <Pill tone="green">
              <BadgeCheck /> verified
            </Pill>
          ) : (
            <Pill tone="amber">draft</Pill>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="xs" variant="secondary">
            <Pencil /> Edit
          </Button>
          {card.status === "draft" ? (
            <Button type="button" size="xs" onClick={onVerify}>
              <CircleCheck /> Mark verified
            </Button>
          ) : (
            <Button type="button" size="xs" variant="secondary" onClick={onVerify}>
              Revert to draft
            </Button>
          )}
          <Tip content="Later — post drafting is a follow-up feature">
            <span>
              <Button type="button" size="xs" variant="outline" disabled>
                Draft post
              </Button>
            </span>
          </Tip>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm">
          {CARD_FIELDS.map(({ key, label }) => {
            const value = cardValue(card, key);
            const hasQuote = Boolean(card.provenance[key]);
            const isActive = active === key;
            return (
              <div key={key} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd
                  onMouseEnter={() => hasQuote && setHover(key)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => hasQuote && setPinned((p) => (p === key ? null : key))}
                  onKeyDown={(e) => {
                    if (hasQuote && (e.key === "Enter" || e.key === " "))
                      setPinned((p) => (p === key ? null : key));
                  }}
                  className={`-mx-1.5 rounded-sm px-1.5 ${hasQuote ? "cursor-pointer" : ""} ${
                    isActive ? "bg-amber-100" : ""
                  }`}
                >
                  {value === UNKNOWN ? (
                    <span className="text-muted-foreground italic">unknown</span>
                  ) : (
                    value
                  )}
                  {hasQuote && (
                    <Quote
                      className={`ml-1.5 inline size-3 align-middle ${
                        isActive ? "text-amber-700" : "text-stone-400"
                      }`}
                    />
                  )}
                </dd>
              </div>
            );
          })}
        </dl>

        <div>
          <div className="mb-2 flex items-center justify-between text-muted-foreground text-xs">
            <span className="font-medium">Abstract</span>
            <span>
              {pinned ? "quote pinned · click field to unpin" : "hover a field to find its quote"}
            </span>
          </div>
          <p className="text-sm leading-relaxed">
            <Highlighted text={paper.abstract} quote={quote} />
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-muted-foreground text-xs">
            <span>PMID {paper.pmid}</span>
            {paper.doi && <span>doi:{paper.doi}</span>}
          </div>
        </div>
      </div>

      <p className="mt-4 text-muted-foreground text-xs">
        Generated by{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{card.modelId}</code> ·{" "}
        {formatDate(card.generatedAt)}{" "}
        {new Date(card.generatedAt).toLocaleTimeString("en-AU", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    </div>
  );
}

function PaperItem({
  paper,
  expanded,
  generating,
  onToggleExpand,
  onToggleStar,
  onToggleTag,
  onVerify,
  onGenerate,
}: {
  paper: Paper;
  expanded: boolean;
  generating: boolean;
  onToggleExpand: () => void;
  onToggleStar: () => void;
  onToggleTag: (tag: string) => void;
  onVerify: () => void;
  onGenerate: () => void;
}) {
  const card = paper.card;
  const retracted = paper.flags.includes("retracted");
  const keyFacts = card
    ? [
        card.sampleSize !== UNKNOWN ? `n = ${card.sampleSize}` : null,
        card.form !== UNKNOWN ? String(card.form) : null,
        card.dose !== UNKNOWN ? String(card.dose) : null,
        card.duration !== UNKNOWN ? String(card.duration) : null,
      ].filter(Boolean)
    : [];

  return (
    <article className="rounded-lg border bg-white p-4 shadow-xs">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          className="min-w-0 flex-1 cursor-pointer text-left"
        >
          <div className="mb-1 flex flex-wrap items-center gap-1">
            {paper.isNew && (
              <Pill tone="green" kind="solid">
                new
              </Pill>
            )}
            <Pill tone={TIER_TONE[paper.tier]}>{TIER_LABEL[paper.tier]}</Pill>
            {paper.flags.map((f) => (
              <Pill key={f} tone={FLAG_TONE[f]} kind={f === "retracted" ? "solid" : "surface"}>
                <TriangleAlert /> {FLAG_LABEL[f]}
              </Pill>
            ))}
            {card?.resultDirection && card.resultDirection !== UNKNOWN && (
              <Pill tone={DIRECTION_TONE[card.resultDirection]} kind="outline">
                {DIRECTION_LABEL[card.resultDirection]}
              </Pill>
            )}
          </div>
          <h3
            className={`font-semibold text-[15px] leading-snug ${
              retracted ? "line-through" : ""
            }`}
          >
            {paper.title}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
            <span>
              {paper.journal} · {formatDate(paper.pubDate)} · {paper.citations ?? 0} cit.
              {paper.openAccess ? " · OA" : ""}
            </span>
            <CardStatusPill card={card} />
            {keyFacts.length > 0 && <span className="font-mono">{keyFacts.join(" · ")}</span>}
          </div>
          {card && !expanded && (
            <div className="mt-2 flex items-start gap-2 text-green-800 text-sm">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-green-700" />
              <span>{card.soWhat}</span>
            </div>
          )}
        </button>
        <div className="flex flex-col items-center gap-1">
          <Tip content={paper.starred ? "Unstar" : "Star"}>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onToggleStar}
              aria-label="Star paper"
              className={paper.starred ? "text-amber-500 hover:text-amber-600" : "text-stone-400"}
            >
              <Star className="size-[18px]" fill={paper.starred ? "currentColor" : "none"} />
            </Button>
          </Tip>
          <Tip content={expanded ? "Collapse" : "Summary, key facts and abstract"}>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onToggleExpand}
              aria-label={expanded ? "Collapse paper" : "Expand paper"}
              className="text-stone-500"
            >
              {expanded ? <ChevronUp /> : <ChevronDown />}
            </Button>
          </Tip>
        </div>
      </div>

      {expanded && (
        <div className="mt-3">
          {card ? (
            <>
              <p className="mb-1 font-medium text-muted-foreground text-xs">In plain language</p>
              <p className="max-w-[70ch] text-sm leading-relaxed">{card.summary}</p>
              <Alert className="mt-3 border-green-200 bg-green-50 text-green-800">
                <Lightbulb />
                <AlertDescription className="text-green-800">{card.soWhat}</AlertDescription>
              </Alert>
              <StudyCardPanel paper={paper} card={card} onVerify={onVerify} />
            </>
          ) : (
            <>
              <Alert>
                {generating ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
                <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                  <span>
                    {generating
                      ? "Extracting key facts with gemma-3-27b-it…"
                      : "No summary yet. Generate the key facts and a plain-language summary."}
                  </span>
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    onClick={onGenerate}
                    disabled={generating}
                  >
                    <Sparkles /> Generate
                  </Button>
                </AlertDescription>
              </Alert>
              <Separator className="my-3" />
              <p className="mb-1 font-medium text-muted-foreground text-xs">Abstract</p>
              <p className="text-sm leading-relaxed">{paper.abstract}</p>
            </>
          )}
        </div>
      )}

      {(expanded || paper.tags.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {paper.tags.map((t) => (
            <Pill key={t} tone="gray" kind="surface">
              #{t}
            </Pill>
          ))}
          {expanded && (
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" size="xs" variant="ghost" className="text-muted-foreground">
                  <Plus /> tag
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-1" align="start">
                {ALL_TAGS.map((t) => {
                  const on = paper.tags.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onToggleTag(t)}
                      className={`flex w-full rounded px-2 py-1 text-left text-sm ${
                        on ? "bg-green-50 text-green-800" : "hover:bg-muted"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </PopoverContent>
            </Popover>
          )}
          {expanded && (
            <span className="ml-auto text-muted-foreground text-xs">
              {paper.sources.map((s) => (s === "pubmed" ? "PubMed" : "Europe PMC")).join(" + ")}
            </span>
          )}
        </div>
      )}
    </article>
  );
}

export default function VariantG() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sortBy, setSortBy] = useState<SortBy>("tier");
  const [starOverride, setStarOverride] = useState<Record<string, boolean>>({});
  const [tagOverride, setTagOverride] = useState<Record<string, string[]>>({});
  const [statusOverride, setStatusOverride] = useState<Record<string, "draft" | "verified">>({});
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [pulling, setPulling] = useState(false);
  const [editingQuery, setEditingQuery] = useState(false);
  const [queryOverride, setQueryOverride] = useState<Record<string, string>>({});
  const [queryDraft, setQueryDraft] = useState("");

  const papers = useMemo<Paper[]>(
    () =>
      PAPERS.map((p) => ({
        ...p,
        starred: starOverride[p.pmid] ?? p.starred,
        tags: tagOverride[p.pmid] ?? p.tags,
        card: p.card ? { ...p.card, status: statusOverride[p.pmid] ?? p.card.status } : undefined,
      })),
    [starOverride, tagOverride, statusOverride],
  );

  const visible = useMemo(
    () => sortPapers(applyFilters(papers, filters), sortBy),
    [papers, filters, sortBy],
  );

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const third = sortPapers(applyFilters(PAPERS, DEFAULT_FILTERS), "tier").filter(
      (p) => p.card,
    )[2];
    return new Set(third ? [third.pmid] : []);
  });

  const patch = (p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p }));

  const segment: Segment = filters.newOnly
    ? "new"
    : filters.starredOnly
      ? "starred"
      : filters.withCardOnly
        ? "card"
        : "all";
  const setSegment = (s: Segment) =>
    patch({ newOnly: s === "new", starredOnly: s === "starred", withCardOnly: s === "card" });

  const selected = WATCHLIST.find((w) => w.id === filters.watchlist) ?? null;
  const selectedQuery = selected ? (queryOverride[selected.id] ?? selected.query) : "";

  const tagCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of papers) for (const t of p.tags) m[t] = (m[t] ?? 0) + 1;
    return m;
  }, [papers]);

  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (filters.search)
    chips.push({ key: "q", label: `“${filters.search}”`, remove: () => patch({ search: "" }) });
  if (selected)
    chips.push({ key: "w", label: selected.term, remove: () => patch({ watchlist: null }) });
  for (const t of filters.pubTypes)
    chips.push({
      key: `pt-${t}`,
      label: t,
      remove: () => patch({ pubTypes: filters.pubTypes.filter((x) => x !== t) }),
    });
  if (filters.humanOnly)
    chips.push({ key: "h", label: "Human only", remove: () => patch({ humanOnly: false }) });
  if (filters.excludeAnimal)
    chips.push({ key: "a", label: "No animal", remove: () => patch({ excludeAnimal: false }) });
  if (filters.openAccessOnly)
    chips.push({ key: "oa", label: "Open access", remove: () => patch({ openAccessOnly: false }) });
  if (filters.starredOnly)
    chips.push({ key: "s", label: "Starred", remove: () => patch({ starredOnly: false }) });
  if (filters.newOnly)
    chips.push({ key: "n", label: "New", remove: () => patch({ newOnly: false }) });
  if (filters.withCardOnly)
    chips.push({ key: "c", label: "Summarised", remove: () => patch({ withCardOnly: false }) });
  if (filters.hideRetracted)
    chips.push({
      key: "r",
      label: "Retracted hidden",
      remove: () => patch({ hideRetracted: false }),
    });
  for (const t of filters.tags)
    chips.push({
      key: `tag-${t}`,
      label: `#${t}`,
      remove: () => patch({ tags: filters.tags.filter((x) => x !== t) }),
    });
  if (filters.since) {
    const label = SINCE_OPTIONS.find((o) => o.value === filters.since)?.label ?? filters.since;
    chips.push({ key: "since", label, remove: () => patch({ since: "" }) });
  }

  const toggleExpand = (pmid: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(pmid)) n.delete(pmid);
      else n.add(pmid);
      return n;
    });

  const toggleTag = (pmid: string, tag: string) =>
    setTagOverride((o) => {
      const cur = o[pmid] ?? PAPERS.find((p) => p.pmid === pmid)?.tags ?? [];
      return { ...o, [pmid]: cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag] };
    });

  const generate = (pmid: string) => {
    setGenerating((g) => ({ ...g, [pmid]: true }));
    window.setTimeout(() => setGenerating((g) => ({ ...g, [pmid]: false })), 1500);
  };

  const pullNow = () => {
    setPulling(true);
    window.setTimeout(() => setPulling(false), 2000);
  };

  const newTotal = WATCHLIST.reduce((n, w) => n + w.newCount, 0);
  const allIds = visible.map((p) => p.pmid);
  const allExpanded = allIds.length > 0 && allIds.every((id) => expanded.has(id));

  return (
    <TooltipProvider delayDuration={200}>
      <div
        style={THEME}
        className="grid h-screen grid-cols-[264px_minmax(0,1fr)] bg-[oklch(0.985_0.004_165)] text-foreground"
      >
        {/* Left sidebar: watchlist, query, ingestion, tags */}
        <aside className="overflow-y-auto border-r bg-white">
          <div className="flex flex-col gap-5 p-3 pb-24">
            <div className="flex items-center gap-2 px-2 pt-1">
              <FlaskConical className="size-[18px] text-green-700" />
              <h1 className="font-semibold text-lg">Enzyme</h1>
              <Pill tone="green" className="ml-auto rounded-full">
                {newTotal} new
              </Pill>
            </div>

            <section>
              <SectionLabel
                action={
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Add watchlist item"
                    className="text-muted-foreground"
                  >
                    <Plus />
                  </Button>
                }
              >
                Watchlist
              </SectionLabel>
              <div className="flex flex-col gap-0.5">
                <SidebarRow
                  on={filters.watchlist === null}
                  onClick={() => patch({ watchlist: null })}
                  label="All papers"
                  right={<span className="text-muted-foreground text-xs">{papers.length}</span>}
                />
                {WATCHLIST.map((w) => {
                  const on = filters.watchlist === w.id;
                  return (
                    <SidebarRow
                      key={w.id}
                      on={on}
                      onClick={() => patch({ watchlist: on ? null : w.id })}
                      label={
                        <>
                          <span className="truncate">{w.term}</span>
                          {w.kind === "topic" && (
                            <Pill tone="gray" kind="outline">
                              topic
                            </Pill>
                          )}
                        </>
                      }
                      right={
                        <>
                          {w.newCount > 0 && (
                            <Pill
                              tone="green"
                              kind="solid"
                              className="min-w-5 justify-center rounded-full"
                            >
                              {w.newCount}
                            </Pill>
                          )}
                          <span className="text-muted-foreground text-xs">{w.total}</span>
                        </>
                      }
                    />
                  );
                })}
              </div>

              {selected && (
                <div className="mt-2 rounded-md border bg-muted/50 p-2.5">
                  <p className="text-muted-foreground text-xs">She asked for</p>
                  <p className="mb-2 text-sm italic">“{selected.nlIntent}”</p>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">PubMed query</span>
                    {!editingQuery && (
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        className="text-muted-foreground"
                        onClick={() => {
                          setQueryDraft(selectedQuery);
                          setEditingQuery(true);
                        }}
                      >
                        <Pencil /> Edit
                      </Button>
                    )}
                  </div>
                  {editingQuery ? (
                    <>
                      <Textarea
                        rows={6}
                        value={queryDraft}
                        onChange={(e) => setQueryDraft(e.target.value)}
                        className="font-mono text-xs"
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <Button
                          type="button"
                          size="xs"
                          variant="secondary"
                          onClick={() => setEditingQuery(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          onClick={() => {
                            setQueryOverride((o) => ({ ...o, [selected.id]: queryDraft }));
                            setEditingQuery(false);
                          }}
                        >
                          Save &amp; re-run
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="max-h-24 overflow-y-auto break-words font-mono text-[11px] text-stone-600 leading-relaxed">
                      {selectedQuery}
                    </div>
                  )}
                </div>
              )}
            </section>

            <section>
              <SectionLabel
                action={
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    onClick={pullNow}
                    disabled={pulling}
                    className="bg-green-50 text-green-800 hover:bg-green-100"
                  >
                    <RefreshCw className={pulling ? "animate-spin" : undefined} />
                    {pulling ? "Pulling…" : "Pull now"}
                  </Button>
                }
              >
                Ingestion
              </SectionLabel>
              <div className="mt-2 flex flex-col gap-3 px-2">
                {INGESTION.map((i) => (
                  <div key={i.source}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 font-medium">
                        {i.state === "done" ? (
                          <CircleCheck className="size-3 text-green-700" />
                        ) : (
                          <LoaderCircle className="size-3 animate-spin text-blue-600" />
                        )}
                        {i.source}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {i.fetched} / {i.total}
                      </span>
                    </div>
                    <Progress
                      value={Math.round((i.fetched / i.total) * 100)}
                      className={`h-1.5 ${i.state === "done" ? "*:bg-green-600" : "*:bg-blue-500"}`}
                    />
                  </div>
                ))}
                <span className="text-muted-foreground text-xs">
                  Last pull {formatDate(INGESTION_RUN_AT)} 07:40
                </span>
              </div>
            </section>

            <section>
              <SectionLabel>Tags</SectionLabel>
              <div className="flex flex-col gap-0.5">
                {ALL_TAGS.map((t) => {
                  const on = filters.tags.includes(t);
                  return (
                    <SidebarRow
                      key={t}
                      on={on}
                      onClick={() =>
                        patch({
                          tags: on ? filters.tags.filter((x) => x !== t) : [...filters.tags, t],
                        })
                      }
                      label={`#${t}`}
                      right={
                        <span className="text-muted-foreground text-xs">{tagCounts[t] ?? 0}</span>
                      }
                    />
                  );
                })}
              </div>
            </section>

            <SidebarRow
              on={filters.starredOnly}
              tone="amber"
              onClick={() => patch({ starredOnly: !filters.starredOnly })}
              label={
                <>
                  <Star className="size-3.5" fill={filters.starredOnly ? "currentColor" : "none"} />
                  Starred
                </>
              }
              right={
                <span className="text-muted-foreground text-xs">
                  {papers.filter((p) => p.starred).length}
                </span>
              }
            />
          </div>
        </aside>

        {/* Main: toolbar + colour-coded feed */}
        <main className="min-w-0 overflow-y-auto">
          <div className="sticky top-0 z-10 border-b bg-[oklch(0.985_0.004_165)]/95 backdrop-blur">
            <div className="mx-auto max-w-[960px] px-5 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[220px] max-w-[420px] flex-1">
                  <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-4 text-muted-foreground" />
                  <Input
                    placeholder="Search titles, abstracts, journals…"
                    value={filters.search}
                    onChange={(e) => patch({ search: e.target.value })}
                    className="bg-white pr-8 pl-8"
                  />
                  {filters.search && (
                    <button
                      type="button"
                      aria-label="Clear search"
                      onClick={() => patch({ search: "" })}
                      className="-translate-y-1/2 absolute top-1/2 right-2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
                <Tabs value={segment} onValueChange={(v) => setSegment(v as Segment)}>
                  <TabsList className="bg-stone-200/60">
                    <TabsTrigger value="all" className="px-3">
                      All
                    </TabsTrigger>
                    <TabsTrigger value="new" className="px-3">
                      New
                    </TabsTrigger>
                    <TabsTrigger value="starred" className="px-3">
                      Starred
                    </TabsTrigger>
                    <TabsTrigger value="card" className="px-3">
                      Summarised
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                  <SelectTrigger size="sm" className="bg-white text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tier">Sort: evidence tier</SelectItem>
                    <SelectItem value="date">Sort: newest first</SelectItem>
                    <SelectItem value="citations">Sort: most cited</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={filters.since || "any"}
                  onValueChange={(v) => patch({ since: v === "any" ? "" : v })}
                >
                  <SelectTrigger size="sm" className="bg-white text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SINCE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" size="sm" variant="outline" className="text-xs">
                      <ListFilter />
                      Type{filters.pubTypes.length ? ` (${filters.pubTypes.length})` : ""}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-52 p-2" align="start">
                    <div className="flex flex-col gap-1.5">
                      {PUB_TYPES.map((t) => {
                        const on = filters.pubTypes.includes(t);
                        return (
                          <label
                            key={t}
                            htmlFor={`g-pt-${t}`}
                            className="flex cursor-pointer items-center gap-2 text-sm"
                          >
                            <Checkbox
                              id={`g-pt-${t}`}
                              checked={on}
                              onCheckedChange={(v) =>
                                patch({
                                  pubTypes: v
                                    ? [...filters.pubTypes, t]
                                    : filters.pubTypes.filter((x): x is PubType => x !== t),
                                })
                              }
                            />
                            {t}
                          </label>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
                <Separator orientation="vertical" className="h-4" />
                <SwitchLabel
                  label="Human only"
                  checked={filters.humanOnly}
                  onChange={(v) => patch({ humanOnly: v })}
                />
                <SwitchLabel
                  label="No animal"
                  checked={filters.excludeAnimal}
                  onChange={(v) => patch({ excludeAnimal: v })}
                />
                <SwitchLabel
                  label="Open access"
                  checked={filters.openAccessOnly}
                  onChange={(v) => patch({ openAccessOnly: v })}
                />
                <SwitchLabel
                  label="Hide retracted"
                  checked={filters.hideRetracted}
                  onChange={(v) => patch({ hideRetracted: v })}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="mr-2 text-muted-foreground text-sm">
                    <span className="font-medium text-foreground">{visible.length}</span> of{" "}
                    {papers.length} papers
                    {selected ? ` in ${selected.term}` : ""}
                  </span>
                  {chips.map((c) => (
                    <Chip key={c.key} label={c.label} onRemove={c.remove} />
                  ))}
                  {chips.length > 0 && (
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      className="text-muted-foreground"
                      onClick={() => setFilters(DEFAULT_FILTERS)}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => setExpanded(new Set(allExpanded ? [] : allIds))}
                >
                  {allExpanded ? <ChevronUp /> : <ChevronDown />}
                  {allExpanded ? "Collapse all" : "Expand all"}
                </Button>
              </div>
            </div>
          </div>

          <div className="mx-auto max-w-[960px] px-5 pt-4 pb-24">
            <div className="flex flex-col gap-2">
              {visible.map((p) => (
                <PaperItem
                  key={p.pmid}
                  paper={p}
                  expanded={expanded.has(p.pmid)}
                  generating={Boolean(generating[p.pmid])}
                  onToggleExpand={() => toggleExpand(p.pmid)}
                  onToggleStar={() =>
                    setStarOverride((o) => ({ ...o, [p.pmid]: !(o[p.pmid] ?? p.starred) }))
                  }
                  onToggleTag={(t) => toggleTag(p.pmid, t)}
                  onVerify={() =>
                    setStatusOverride((o) => ({
                      ...o,
                      [p.pmid]: p.card?.status === "verified" ? "draft" : "verified",
                    }))
                  }
                  onGenerate={() => generate(p.pmid)}
                />
              ))}
              {visible.length === 0 && (
                <div className="flex flex-col items-center gap-2 rounded-lg border bg-white py-12">
                  <span className="text-muted-foreground">No papers match these filters.</span>
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    onClick={() => setFilters(DEFAULT_FILTERS)}
                  >
                    Clear filters
                  </Button>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
