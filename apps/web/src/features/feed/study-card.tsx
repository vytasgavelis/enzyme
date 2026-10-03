import {
  type CardField,
  type CardFieldKey,
  cardFieldKeys,
  cardFields,
  cardResultDirection,
  type FeedPaper,
  type ResultDirection,
  resultDirectionLabels,
  type StudyCard,
} from "@enzyme/shared";
import { Info, LoaderCircle, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Pill, type PillTone } from "@/components/pill";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCardStatus, useGenerateCard } from "@/lib/queries";

export const DIRECTION_TONE: Record<ResultDirection, PillTone> = {
  improved: "green",
  worsened: "red",
  "no-difference": "gray",
  mixed: "amber",
};

export function ResultPill({ card }: { card: StudyCard }) {
  const direction = cardResultDirection(card);
  if (!direction) return null;
  return (
    <Pill tone={DIRECTION_TONE[direction]} kind="outline">
      {resultDirectionLabels[direction]}
    </Pill>
  );
}

/** Sample size, dose and duration when stated: the numbers she scans the feed for. */
export function keyNumbers(card: StudyCard): string[] {
  return (["sampleSize", "doseOrRegimen", "duration"] as const).flatMap((k) =>
    card[k].status === "stated" && card[k].value ? [card[k].value] : [],
  );
}

/** "Summarise" for a paper without a card, with its in-flight and error states. */
export function SummariseButton({
  paper,
  size = "xs",
  label = "Summarise",
}: {
  paper: FeedPaper;
  size?: "xs" | "sm";
  label?: string;
}) {
  const generate = useGenerateCard();
  const { pending } = useCardStatus(paper.id);
  if (!paper.abstract) return null;
  return (
    <Button
      type="button"
      size={size}
      variant="secondary"
      disabled={pending}
      onClick={(e) => {
        e.stopPropagation();
        generate.mutate(paper.id);
      }}
    >
      {pending ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
      {pending ? "Summarising…" : label}
    </Button>
  );
}

export function CardError({ paperId }: { paperId: number }) {
  const { error, pending } = useCardStatus(paperId);
  if (!error || pending) return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-red-700 text-xs">
      <TriangleAlert className="size-3" /> {error}
    </p>
  );
}

/**
 * The expanded paper's card: plain summary, takeaway and the key facts. Hovering a fact
 * highlights its quote in the abstract (`onActive`).
 */
export function StudyCardPanel({
  paper,
  active,
  onActive,
}: {
  paper: FeedPaper;
  active: CardFieldKey | null;
  onActive: (key: CardFieldKey | null) => void;
}) {
  const { pending } = useCardStatus(paper.id);
  const generate = useGenerateCard();

  if (!paper.card) {
    return (
      <div className="mb-3 rounded-md bg-muted/60 px-3 py-2 text-muted-foreground text-sm">
        <div className="flex items-center justify-between gap-3">
          <span>
            {paper.abstract
              ? "Key facts and a plain-language summary, pulled from the abstract."
              : "No abstract, so there is nothing to summarise."}
          </span>
          <SummariseButton paper={paper} />
        </div>
        <CardError paperId={paper.id} />
      </div>
    );
  }

  const { card, modelId, latencyMs } = paper.card;
  const suspect = cardFieldKeys.filter((k) => card[k].status === "suspect").length;

  return (
    <section className="mb-4 flex flex-col gap-3">
      {card.plainSummary && (
        <p className="max-w-[75ch] text-sm leading-relaxed">{card.plainSummary}</p>
      )}
      {card.takeaway && (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-green-900 text-sm">
          <span className="font-medium">Takeaway: </span>
          {card.takeaway}
        </div>
      )}

      <div>
        <div className="mb-1.5 flex items-center gap-1.5">
          <h4 className="font-semibold text-sm">Key facts</h4>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="size-3.5 text-muted-foreground" aria-label="About key facts" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Pulled from the abstract by an AI model. Each fact links to the sentence it came from:
              hover it to see the quote highlighted. "Not stated" means the abstract doesn't say,
              not that it's absent from the paper.
            </TooltipContent>
          </Tooltip>
          {suspect > 0 && (
            <Pill tone="amber" kind="surface" className="ml-1">
              <TriangleAlert /> {suspect} unverified
            </Pill>
          )}
        </div>
        <dl className="grid grid-cols-1 overflow-hidden rounded-md border text-sm sm:grid-cols-[160px_minmax(0,1fr)]">
          {cardFieldKeys.map((k) => (
            <FactRow
              key={k}
              label={cardFields[k].label}
              field={card[k]}
              display={k === "resultDirection" ? directionText(card[k]) : undefined}
              active={active === k}
              onActive={(on) => onActive(on ? k : null)}
            />
          ))}
        </dl>
      </div>

      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <span>
          {modelId.replace(/^[^/]+\//, "")} · {(latencyMs / 1000).toFixed(1)} s
        </span>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={pending}
          onClick={() => generate.mutate(paper.id)}
        >
          {pending ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
          {pending ? "Regenerating…" : "Regenerate"}
        </Button>
        <CardError paperId={paper.id} />
      </div>
    </section>
  );
}

function directionText(f: CardField) {
  const label = resultDirectionLabels[f.value as ResultDirection];
  return label ?? f.value ?? undefined;
}

function FactRow({
  label,
  field,
  display,
  active,
  onActive,
}: {
  label: string;
  field: CardField;
  display?: string;
  active: boolean;
  onActive: (on: boolean) => void;
}) {
  let value: ReactNode;
  if (field.status === "unknown") {
    value = <span className="text-muted-foreground italic">Not stated</span>;
  } else {
    value = (
      <span className="flex flex-wrap items-center gap-1.5">
        <span>{display ?? field.value}</span>
        {field.status === "suspect" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Pill tone="amber" kind="surface">
                  <TriangleAlert /> check
                </Pill>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              {field.quote
                ? `The model quoted "${field.quote}", which isn't in the abstract. Treat this fact as unverified.`
                : "The model gave no quote for this, so it can't be checked against the abstract."}
            </TooltipContent>
          </Tooltip>
        )}
      </span>
    );
  }
  // A verified fact is a button so hover and keyboard focus both show its quote.
  const linked = field.status === "stated" && field.quote;
  return (
    <>
      <dt
        className={`border-b bg-muted/40 px-3 py-1.5 font-medium text-muted-foreground text-xs sm:py-2 ${active ? "bg-amber-100" : ""}`}
      >
        {label}
      </dt>
      <dd className={`border-b px-3 pb-2 sm:py-1.5 ${active ? "bg-amber-50" : ""}`}>
        {linked ? (
          <button
            type="button"
            className="w-full cursor-default text-left outline-none"
            title="Highlighted in the abstract below"
            onMouseEnter={() => onActive(true)}
            onMouseLeave={() => onActive(false)}
            onFocus={() => onActive(true)}
            onBlur={() => onActive(false)}
          >
            {value}
          </button>
        ) : (
          value
        )}
      </dd>
    </>
  );
}
