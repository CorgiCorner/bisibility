import { IdChip } from "@/components/ui/IdChip";
import {
  migrationImportCountEntries,
  migrationImportCountSummary,
} from "@/lib/migration/import-counts";
import type { MigrationImportCompletion } from "@/lib/migration/result";

export function ImportCompletionSummary({
  completion,
}: Readonly<{ completion: MigrationImportCompletion }>) {
  const countEntries = migrationImportCountEntries(completion.counts);
  const summary = migrationImportCountSummary(completion.counts);
  return (
    <div className="mt-4 w-full max-w-[420px] rounded-control border border-border bg-bg-sunken px-3.5 py-3 text-left">
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-fg-muted">
        Import job
        <IdChip copyLabel="Copy import job ID" size="xs" value={completion.jobId} />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {countEntries.length > 0 ? (
          countEntries.map((entry) => (
            <span
              className="rounded-full border border-border bg-bg-elev px-2.5 py-1 font-sans tabular-nums text-[10.5px] text-fg-muted"
              key={entry}
            >
              {entry}
            </span>
          ))
        ) : (
          <span className="font-sans tabular-nums text-[11px] text-fg-muted">
            No imported rows reported.
          </span>
        )}
      </div>
      {summary.visibilityNote ? (
        <p className="m-0 mt-2 text-[11px] leading-[1.45] text-yellow-text">
          {summary.visibilityNote}
        </p>
      ) : null}
    </div>
  );
}
