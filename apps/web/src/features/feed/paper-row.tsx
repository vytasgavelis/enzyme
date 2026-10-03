import {
  type CardFieldKey,
  cardFieldKeys,
  type FeedPaper,
  quoteParts,
  type Tier,
  tierLabels,
} from "@enzyme/shared";
import { ChevronDown, ChevronUp, ExternalLink, TriangleAlert } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Pill, type PillTone } from "@/components/pill";
import { type Mark, SourceHtml } from "@/components/source-html";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate } from "@/lib/format";
import { useCardStatus } from "@/lib/queries";
import { CardError, keyNumbers, ResultPill, StudyCardPanel, SummariseButton } from "./study-card";

export const TIER_TONE: Record<Tier, { tone: PillTone; kind: "soft" | "surface" }> = {
  "meta-analysis": { tone: "green", kind: "soft" },
  "systematic-review": { tone: "teal", kind: "soft" },
  rct: { tone: "blue", kind: "soft" },
  "clinical-trial": { tone: "blue", kind: "surface" },
  observational: { tone: "gray", kind: "soft" },
  review: { tone: "gray", kind: "surface" },
  "case-report": { tone: "gray", kind: "surface" },
  other: { tone: "gray", kind: "surface" },
};

const TIER_HINT: Record<Tier, string> = {
  "meta-analysis": "Pools the results of several studies. Strongest evidence type.",
  "systematic-review": "Searches for and appraises all studies on a question.",
  rct: "Randomised controlled trial: participants randomly assigned to treatment or control.",
  "clinical-trial": "A trial in people, not necessarily randomised.",
  observational: "Observes people without assigning a treatment; shows association, not cause.",
  review: "Narrative review of other papers. No new data.",
  "case-report": "Describes one or a few patients.",
  other: "Publication type not recognised. Often original research the source hasn't classified.",
};

/** "Sun Y, Li Y, Ren M." -> "Sun Y et al." */
function shortAuthors(authors: string | null) {
  if (!authors) return null;
  const list = authors.replace(/\.$/, "").split(", ");
  return list.length > 2 ? `${list[0]} et al.` : list.join(", ");
}

function Tip({ content, children }: { content: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-xs">{content}</TooltipContent>
    </Tooltip>
  );
}

export function PaperRow({
  paper,
  expanded,
  onToggle,
}: {
  paper: FeedPaper;
  expanded: boolean;
  onToggle: () => void;
}) {
  const tier = TIER_TONE[paper.tier];
  const authors = shortAuthors(paper.authors);

  return (
    <article className="rounded-lg border bg-white p-4 shadow-xs">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="min-w-0 flex-1 cursor-pointer text-left"
        >
          <div className="mb-1 flex flex-wrap items-center gap-1">
            {paper.isNew && (
              <Pill tone="green" kind="solid">
                new
              </Pill>
            )}
            {paper.tier !== "other" && (
              <Tip
                content={
                  paper.tierFromTitle
                    ? `${TIER_HINT[paper.tier]} Guessed from the title: the source hasn't classified this paper yet.`
                    : TIER_HINT[paper.tier]
                }
              >
                <Pill tone={tier.tone} kind={tier.kind}>
                  {tierLabels[paper.tier]}
                  {paper.tierFromTitle && <span className="opacity-60">?</span>}
                </Pill>
              </Tip>
            )}
            {paper.isRetracted && (
              <Pill tone="red" kind="solid">
                <TriangleAlert /> Retracted
              </Pill>
            )}
            {paper.isPreprint && (
              <Tip content="Not peer reviewed yet.">
                <Pill tone="amber" kind="surface">
                  <TriangleAlert /> Preprint
                </Pill>
              </Tip>
            )}
            {paper.species === "animal" && (
              <Tip content="MeSH says this study was done in animals, not people.">
                <Pill tone="orange" kind="surface">
                  <TriangleAlert /> Animal only
                </Pill>
              </Tip>
            )}
            {paper.card && <ResultPill card={paper.card.card} />}
          </div>
          <h3
            className={`font-semibold text-[15px] leading-snug ${paper.isRetracted ? "line-through" : ""}`}
          >
            {paper.title ? <SourceHtml html={paper.title} /> : "(untitled)"}
          </h3>
          <p className="mt-1 text-muted-foreground text-xs">
            {[
              authors,
              paper.journal,
              paper.pubDate && formatDate(paper.pubDate),
              paper.citedByCount !== null && `${paper.citedByCount} cited`,
              paper.isOpenAccess && "Open access",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {paper.card && !expanded && <CardLine paper={paper} />}
          {!expanded && <CardError paperId={paper.id} />}
        </button>
        {!paper.card && !expanded && <SummariseButton paper={paper} />}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onToggle}
          aria-label={expanded ? "Collapse paper" : "Expand paper"}
          className="text-stone-500"
        >
          {expanded ? <ChevronUp /> : <ChevronDown />}
        </Button>
      </div>

      {expanded && <PaperDetail paper={paper} />}
    </article>
  );
}

/** The collapsed row's card line: key numbers in mono, then the takeaway. */
function CardLine({ paper }: { paper: FeedPaper }) {
  const { pending } = useCardStatus(paper.id);
  const card = paper.card?.card;
  if (!card) return null;
  const numbers = keyNumbers(card);
  return (
    <div className={`mt-1.5 flex flex-col gap-0.5 ${pending ? "opacity-50" : ""}`}>
      {numbers.length > 0 && (
        <p className="font-mono text-stone-600 text-xs">{numbers.join(" · ")}</p>
      )}
      {card.takeaway && <p className="text-green-900 text-sm">{card.takeaway}</p>}
    </div>
  );
}

function PaperDetail({ paper }: { paper: FeedPaper }) {
  const links = paperLinks(paper);
  const [active, setActive] = useState<CardFieldKey | null>(null);
  const card = paper.card?.card;
  // Every verified quote is lightly marked; the hovered fact's quote stands out.
  const marks: Mark[] = card
    ? cardFieldKeys.flatMap((k) =>
        card[k].status === "stated" && card[k].quote
          ? quoteParts(card[k].quote).map((quote) => ({ quote, active: k === active }))
          : [],
      )
    : [];

  return (
    <div className="mt-3">
      <Separator className="mb-3" />
      <StudyCardPanel paper={paper} active={active} onActive={setActive} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div>
          <p className="mb-1 font-medium text-muted-foreground text-xs">Abstract</p>
          <div className="max-w-[75ch] text-sm leading-relaxed">
            {paper.abstract ? <SourceHtml html={paper.abstract} marks={marks} /> : "No abstract."}
          </div>
          {paper.authors && <p className="mt-3 text-muted-foreground text-xs">{paper.authors}</p>}
        </div>

        <dl className="flex flex-col gap-3 text-xs">
          <Fact label="Links">
            <div className="flex flex-col gap-1">
              {links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-green-800 hover:underline"
                >
                  {l.label} <ExternalLink className="size-3" />
                </a>
              ))}
            </div>
          </Fact>
          <Fact label="Publication type">{paper.pubTypes?.join(", ") || "unknown"}</Fact>
          <Fact label="Studied in">
            {paper.species === "human"
              ? "Humans"
              : paper.species === "animal"
                ? "Animals"
                : paper.meshHeadings === null || paper.meshHeadings.length === 0
                  ? "Unknown (not indexed in MeSH yet)"
                  : "Unknown"}
          </Fact>
          {paper.meshHeadings && paper.meshHeadings.length > 0 && (
            <Fact label="MeSH topics">
              <div className="flex flex-wrap gap-1">
                {paper.meshHeadings.map((m) => (
                  <Pill key={m} tone="gray" kind="surface">
                    {m}
                  </Pill>
                ))}
              </div>
            </Fact>
          )}
          {paper.keywords && paper.keywords.length > 0 && (
            <Fact label="Keywords">{paper.keywords.join(", ")}</Fact>
          )}
        </dl>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="mb-0.5 font-medium text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function paperLinks(p: FeedPaper) {
  const links: { label: string; href: string }[] = [];
  const free = p.fullTextUrls?.find(
    (u) => u.availability === "Free" || u.availability === "Open access",
  );
  if (p.pmcid) {
    links.push({
      label: "Full text (PMC)",
      href: `https://pmc.ncbi.nlm.nih.gov/articles/${p.pmcid}/`,
    });
  } else if (free) {
    links.push({
      label: `Full text${free.documentStyle === "pdf" ? " (PDF)" : ""}`,
      href: free.url,
    });
  }
  if (p.doi) links.push({ label: "Publisher (DOI)", href: `https://doi.org/${p.doi}` });
  if (p.pmid) links.push({ label: "PubMed", href: `https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/` });
  links.push({
    label: "Europe PMC",
    href: `https://europepmc.org/article/${p.source}/${p.sourceId}`,
  });
  return links;
}
