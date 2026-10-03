import type { SavedSearch } from "@enzyme/shared";
import { LoaderCircle, Trash2 } from "lucide-react";
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
import { useDeleteSearch, useSaveSearch } from "@/lib/queries";

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
  const queryId = useId();
  const [name, setName] = useState(search?.name ?? "");
  // An empty query means "search for the name"; show it empty again in that case.
  const [query, setQuery] = useState(search && search.query !== search.name ? search.query : "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useSaveSearch();
  const remove = useDeleteSearch();

  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    save.mutate(
      { id: search?.id, input: { name, query } },
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
