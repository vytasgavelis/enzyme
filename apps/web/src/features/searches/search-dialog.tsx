import { type QuerySuggestion, type SavedSearch, USEFUL_HITS } from "@enzyme/shared";
import { LoaderCircle, Sparkles, Trash2 } from "lucide-react";
import { type SubmitEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDeleteSearch, useSaveSearch, useSuggestQuery } from "@/lib/queries";

const EXAMPLES = [
  { label: "Both words", query: "magnesium AND sleep" },
  { label: "Either word", query: "ashwagandha AND (stress OR anxiety)" },
  { label: "Exact phrase", query: '"sleep quality" AND glycine' },
  { label: "Leave something out", query: "creatine AND memory NOT athletes" },
];

/**
 * Add or edit a saved search. `onSaved` gets the saved search and whether its query changed,
 * so the caller can pull straight away.
 */
export function SearchDialog({
  open,
  onOpenChange,
  search,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  search?: SavedSearch;
  onSaved: (search: SavedSearch, queryChanged: boolean) => void;
  onDeleted?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Remount per open so the form starts from the current values. */}
        {open && (
          <SearchForm
            search={search}
            onSaved={(s, changed) => {
              onOpenChange(false);
              onSaved(s, changed);
            }}
            onDeleted={() => {
              onOpenChange(false);
              onDeleted?.();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SearchForm({
  search,
  onSaved,
  onDeleted,
}: {
  search?: SavedSearch;
  onSaved: (search: SavedSearch, queryChanged: boolean) => void;
  onDeleted: () => void;
}) {
  const nameId = useId();
  const intentId = useId();
  const queryId = useId();
  const [name, setName] = useState(search?.name ?? "");
  const [intent, setIntent] = useState(search?.intent ?? "");
  // An empty query means "search for the name"; show it empty again in that case.
  const [query, setQuery] = useState(search && search.query !== search.name ? search.query : "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useSaveSearch();
  const remove = useDeleteSearch();
  const suggest = useSuggestQuery();
  const [suggestion, setSuggestion] = useState<QuerySuggestion | null>(null);
  const describe = intent.trim() || name.trim();

  const suggestQuery = () => {
    setSuggestion(null);
    const before = query;
    suggest.mutate(
      { intent: describe },
      {
        onSuccess: (s) => {
          setSuggestion(s);
          // Don't overwrite what she typed while waiting; the note then offers the suggestion.
          setQuery((current) => (current === before ? s.query : current));
        },
      },
    );
  };

  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    save.mutate(
      { id: search?.id, input: { name, query, intent } },
      { onSuccess: (s) => onSaved(s, s.query !== search?.query) },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{search ? "Edit search" : "New search"}</DialogTitle>
        <DialogDescription>
          Enzyme looks for papers on Europe PMC (which includes PubMed and preprints) and keeps them
          here.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameId}>Name</Label>
        <Input
          id={nameId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Magnesium & sleep"
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={intentId}>
          Describe it in plain English{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id={intentId}
          rows={2}
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="e.g. does magnesium help older adults sleep better?"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={suggest.isPending || !describe}
            onClick={suggestQuery}
          >
            {suggest.isPending ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
            {suggest.isPending ? "Writing a query…" : "Suggest query"}
          </Button>
          <span className="text-muted-foreground text-xs">
            {suggest.isPending
              ? "The AI tries a few queries and counts the papers each finds (10–30 s)."
              : "The AI writes the search below for you. You can still edit it."}
          </span>
        </div>
        {suggest.error && (
          <p className="text-destructive text-xs" role="alert">
            Couldn’t suggest a query: {suggestError(suggest.error)} You can still type one, or leave
            it empty to search for the name.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={queryId}>
          What to search for <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id={queryId}
          rows={3}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={name ? `Leave empty to search for “${name}”` : "magnesium AND sleep"}
          className="font-mono text-xs"
        />
        {suggestion &&
          (query === suggestion.query ? (
            <SuggestionNote suggestion={suggestion} />
          ) : (
            <SuggestionOffer suggestion={suggestion} onUse={() => setQuery(suggestion.query)} />
          ))}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => setQuery(ex.query)}
              className="rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground text-xs hover:bg-accent hover:text-foreground"
              title={ex.query}
            >
              {ex.label}: <span className="font-mono">{ex.query}</span>
            </button>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
          Only papers with an abstract are kept. Up to 500 papers per pull.
        </p>
      </div>

      {save.error && <p className="text-destructive text-sm">{save.error.message}</p>}

      <DialogFooter className="items-center sm:justify-between">
        {search ? (
          confirmDelete ? (
            <div className="flex items-center gap-2 text-sm">
              Delete “{search.name}” and its feed?
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate(search.id, { onSuccess: onDeleted })}
              >
                Delete
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
              >
                Keep
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 /> Delete search
            </Button>
          )
        ) : (
          <span />
        )}
        {!confirmDelete && (
          <Button type="submit" disabled={save.isPending || !name.trim()}>
            {save.isPending && <LoaderCircle className="animate-spin" />}
            {search ? "Save" : "Add and pull papers"}
          </Button>
        )}
      </DialogFooter>
    </form>
  );
}

function suggestError(err: Error): string {
  if (err.name === "TimeoutError" || err.name === "AbortError") return "it took too long.";
  return /[.!?]$/.test(err.message) ? err.message : `${err.message}.`;
}

function HitCount({ hitCount }: { hitCount: number }) {
  const inRange = hitCount >= USEFUL_HITS.min && hitCount <= USEFUL_HITS.max;
  return (
    <>
      <span className={inRange ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>
        {hitCount.toLocaleString()} {hitCount === 1 ? "paper" : "papers"}
      </span>
      {!inRange && <span className="text-amber-700"> (more or fewer than ideal)</span>}
    </>
  );
}

/** Hit count and the agent's one-line explanation, under the suggested query. */
function SuggestionNote({ suggestion }: { suggestion: QuerySuggestion }) {
  return (
    <p className="text-xs" data-testid="suggestion-note">
      <HitCount hitCount={suggestion.hitCount} />
      {suggestion.explanation && (
        <span className="text-muted-foreground"> · {suggestion.explanation}</span>
      )}
    </p>
  );
}

/** A suggestion that arrived after she changed the query: offered, not applied. */
function SuggestionOffer({
  suggestion,
  onUse,
}: {
  suggestion: QuerySuggestion;
  onUse: () => void;
}) {
  return (
    <div className="rounded-md bg-muted px-2.5 py-2 text-xs" data-testid="suggestion-offer">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">
          Suggested query · <HitCount hitCount={suggestion.hitCount} />
        </span>
        <Button type="button" size="xs" variant="outline" onClick={onUse}>
          Use it
        </Button>
      </div>
      <p className="mt-1 break-words font-mono">{suggestion.query}</p>
    </div>
  );
}
