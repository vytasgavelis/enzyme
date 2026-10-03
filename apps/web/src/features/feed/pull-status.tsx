import type { PullRun } from "@enzyme/shared";
import { CircleCheck, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { timeAgo } from "@/lib/format";

/** "Pull now" plus what the last pull did, with live progress while one runs (EN-22). */
export function PullStatus({
  run,
  starting,
  onPull,
}: {
  run: PullRun | null;
  starting: boolean;
  onPull: () => void;
}) {
  const running = run?.status === "running";
  const percent =
    running && run.target ? Math.round((run.fetched / Math.max(run.target, 1)) * 100) : 0;

  return (
    <div className="flex w-72 shrink-0 flex-col items-end gap-1.5">
      <Button type="button" size="sm" onClick={onPull} disabled={running || starting}>
        <RefreshCw className={running || starting ? "animate-spin" : undefined} />
        {running ? "Pulling…" : run ? "Pull new papers" : "Pull papers"}
      </Button>

      {running && (
        <div className="w-full">
          <Progress value={run.target ? percent : 5} className="h-1.5 *:bg-blue-500" />
          <p className="mt-1 text-right text-muted-foreground text-xs tabular-nums">
            {run.target === null
              ? "Asking Europe PMC…"
              : `Checked ${run.fetched} of ${run.target} · ${run.newMatches} new so far`}
          </p>
        </div>
      )}

      {run?.status === "succeeded" && run.finishedAt && (
        <p className="flex items-center gap-1 text-muted-foreground text-xs">
          <CircleCheck className="size-3 text-green-700" />
          Pulled {timeAgo(run.finishedAt)} ·{" "}
          {run.newMatches === 0
            ? "nothing new"
            : `${run.newMatches} new paper${run.newMatches === 1 ? "" : "s"}`}
          {run.hitCount !== null &&
            run.target !== null &&
            run.hitCount > run.target &&
            ` (first ${run.target} of ${run.hitCount})`}
        </p>
      )}

      {run?.status === "failed" && (
        <p className="flex items-center gap-1 text-red-700 text-xs">
          <TriangleAlert className="size-3" />
          Last pull failed: {run.error ?? "unknown error"}
        </p>
      )}

      {!run && <p className="text-muted-foreground text-xs">Not pulled yet</p>}
    </div>
  );
}
