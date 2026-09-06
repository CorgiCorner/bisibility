import type { RunPageSummary } from "./RunPageModel";
import type { RunPageData } from "./RunPageTypes";

type RunPageCountersProps = {
  onShowSkipped: () => void;
  run: RunPageData;
  summary: RunPageSummary;
};

function width(value: number, total: number): string {
  return `${total ? (value / total) * 100 : 0}%`;
}

export function RunPageCounters({ onShowSkipped, run, summary }: Readonly<RunPageCountersProps>) {
  if (summary.planned) return null;

  return (
    <section
      aria-label="Run counters"
      className="min-w-0 rounded-card border border-border bg-bg-elev p-4"
    >
      {summary.skipped ? (
        <p className="m-0 text-[12.5px] leading-[1.55] text-fg">{summary.skippedLine}</p>
      ) : (
        <>
          <p className="m-0 w-fit text-[11.5px] leading-[1.6] text-fg">
            {summary.matchedLine}
            {run.counts.skipped > 0 ? (
              <>
                <span aria-hidden className="px-2 text-fg-muted">
                  /
                </span>
                <button
                  className="border-0 border-b border-dashed border-border-control bg-transparent p-0 font-sans text-[11.5px] text-fg"
                  onClick={onShowSkipped}
                  title={summary.skippedLine}
                  type="button"
                >
                  {run.counts.skipped.toLocaleString("en-US")} skipped before start
                </button>
              </>
            ) : null}
          </p>
          <div
            aria-label={`Run progress: ${summary.progressLabel}`}
            aria-valuemax={run.counts.total}
            aria-valuemin={0}
            aria-valuenow={summary.processed}
            className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-meter-track"
            role="progressbar"
          >
            <span
              className="h-full bg-green"
              style={{ width: width(run.counts.completed, run.counts.total) }}
            />
            <span
              className="h-full bg-red"
              style={{ width: width(run.counts.failed, run.counts.total) }}
            />
            <span
              className="h-full bg-yellow"
              style={{ width: width(run.counts.deferred, run.counts.total) }}
            />
            <span
              className="h-full bg-fg-muted"
              style={{ width: width(run.counts.cancelled, run.counts.total) }}
            />
          </div>
          <p className="mb-0 mt-1.5 text-[10.5px] tabular-nums text-fg-muted">
            {summary.progressLabel}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-[18px] sm:grid-cols-4">
            {summary.counters.map((counter) => (
              <div key={counter.label}>
                <span className="block text-[10.5px] font-semibold uppercase tracking-[0.05em] text-fg-muted">
                  {counter.label}
                </span>
                <span className="mt-1 block text-xl font-semibold leading-none tabular-nums text-fg">
                  {counter.count.toLocaleString("en-US")}
                </span>
                <span className="mt-[5px] block truncate text-[10px] leading-[1.5] text-fg-muted">
                  {counter.note}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
