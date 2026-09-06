import { useDeploymentMode } from "@/components/shell/DeploymentModeProvider";
import { Button, itemStatusChipPresentation, StatusChip } from "@/components/ui";
import { deviceLabel } from "@/lib/queries/keyword-row-format";
import { isUnrunnableReason } from "@/lib/rank-check/runnable-reasons";
import {
  blockedRunPresentation,
  type ClientDeploymentMode,
} from "@/lib/rank-check/runs/blocked-presentation";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import Link from "next/link";
import type { RunItemFilter, RunPageSummary } from "./RunPageModel";
import { runFilters } from "./RunPageModel";
import { RunPageTargetActions } from "./RunPageTargetActions";
import type { RunPageData, RunPageItem } from "./RunPageTypes";

type RunPageTargetsProps = {
  busy: string | null;
  canMutate: boolean;
  cursor: string | null;
  filter: RunItemFilter;
  items: RunPageItem[];
  onCancel: () => void;
  onFilter: (filter: RunItemFilter) => void;
  onLoadMore: () => void;
  onMutate: (mutation: "run-now" | "skip" | "retry-failed" | "retry-deferred") => void;
  projectRef: ProjectRef;
  run: RunPageData;
  summary: RunPageSummary;
};

function money(value: number | null): string {
  if (value === null) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
}

function note(item: RunPageItem, run: RunPageData, deploymentMode: ClientDeploymentMode) {
  // A cancelled item carries a machine reason code, so map it before branching on status; the
  // raw code must never reach the reader, whatever status the item ended on.
  if (isUnrunnableReason(item.blockedReason)) {
    return blockedRunPresentation({ deploymentMode, reason: item.blockedReason }).compact;
  }
  if (item.status === "skipped" || item.status === "blocked") {
    return item.blockedReason ?? "Skipped before start";
  }
  if (run.status === "blocked" && item.status === "queued") {
    return blockedRunPresentation({
      budget: run.budget,
      deploymentMode,
      reason: run.blockedReason,
    }).compact;
  }
  return item.rankCheck?.errorCode ?? "";
}

function RunPageFilters({
  filter,
  onFilter,
  run,
}: Pick<RunPageTargetsProps, "filter" | "onFilter" | "run">) {
  const filters = runFilters(run);
  if (filters.length <= 1) return null;
  return (
    <div
      aria-label="Filter targets"
      className="inline-flex min-h-[34px] items-center gap-0.5 rounded-control border border-border-control p-[3px]"
      role="radiogroup"
    >
      {filters.map(({ count, value }) => {
        const label = value === "all" ? "All" : itemStatusChipPresentation(value).label;
        return (
          <label
            className={`h-[26px] cursor-pointer rounded-control border px-2.5 text-[12.5px] font-normal leading-[24px] ${filter === value ? "border-border-control bg-nav-active text-fg" : "border-transparent bg-transparent text-fg-muted"}`}
            key={value}
            title={count === null ? undefined : `${count.toLocaleString("en-US")} targets`}
          >
            <input
              checked={filter === value}
              className="sr-only"
              name="run-check-filter"
              onChange={() => onFilter(value)}
              type="radio"
              value={value}
            />
            {label}
          </label>
        );
      })}
    </div>
  );
}

export function RunPageTargets({
  busy,
  canMutate,
  cursor,
  filter,
  items,
  onCancel,
  onFilter,
  onLoadMore,
  onMutate,
  projectRef,
  run,
  summary,
}: Readonly<RunPageTargetsProps>) {
  const deploymentMode = useDeploymentMode();
  const live = summary.active && filter === "all";
  const headings = ["Keyword", "Status", "Market", "Device", "Position", "Cost"];
  const showNotes =
    run.status === "blocked" || items.some((item) => note(item, run, deploymentMode));
  if (showNotes) headings.push("Note");
  return (
    <section
      aria-labelledby="run-targets-title"
      className="min-w-0 overflow-hidden rounded-card border border-border bg-bg-elev"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5">
        <div>
          <h2
            className="m-0 text-[15px] font-semibold leading-[1.35] text-fg"
            id="run-targets-title"
          >
            Targets in this run
          </h2>
          <p className="m-0 text-[10px] leading-[1.45] text-fg-muted">
            {live ? "Newest first" : "Alphabetical"}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <RunPageFilters filter={filter} onFilter={onFilter} run={run} />
          <RunPageTargetActions
            busy={busy}
            canMutate={canMutate}
            onCancel={onCancel}
            onMutate={onMutate}
            run={run}
            summary={summary}
          />
        </div>
      </header>
      <div className="overflow-x-auto">
        <table
          aria-label="Targets in this run"
          className="w-full min-w-[860px] table-fixed border-collapse"
        >
          <thead className="text-left text-[11px] uppercase tracking-[0.5px] text-fg-muted">
            <tr>
              {headings.map((heading) => (
                <th
                  className="border-b border-border px-3 py-2.5 font-semibold"
                  key={heading}
                  scope="col"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-8 text-center text-[12px] text-fg-muted"
                  colSpan={headings.length}
                >
                  Nothing was sent.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const status = itemStatusChipPresentation(
                  run.status === "blocked" && item.status === "queued" ? "blocked" : item.status,
                );
                const itemNote = note(item, run, deploymentMode);
                return (
                  <tr className="border-t border-border text-[12px]" key={item.id}>
                    <td className="px-3 py-[11px]">
                      <Link
                        className="block truncate font-semibold text-fg no-underline hover:text-accent-text"
                        href={appPath(projectRef, "rank-tracker", item.keyword.publicId)}
                      >
                        {item.keyword.text}
                      </Link>
                    </td>
                    <td className="px-3 py-[11px]">
                      <StatusChip label={status.label} tone={status.tone} />
                    </td>
                    <td className="px-3 py-[11px] font-semibold text-fg">
                      {item.keyword.location}
                      {item.keyword.languageLabel ? ` / ${item.keyword.languageLabel}` : ""}
                    </td>
                    <td className="px-3 py-[11px] text-[11px] text-fg-muted">
                      {deviceLabel(item.keyword.device)}
                    </td>
                    <td className="px-3 py-[11px] font-semibold tabular-nums text-fg">
                      {item.rankCheck?.position ?? "-"}
                    </td>
                    <td className="px-3 py-[11px] text-[11px] tabular-nums text-fg-muted">
                      {money(item.actualCostCents ?? item.estimatedCostCents)}
                    </td>
                    {showNotes ? (
                      <td className="px-3 py-[11px]">
                        <span
                          className="block truncate text-[11.5px] text-fg-muted"
                          title={itemNote}
                        >
                          {itemNote}
                        </span>
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <footer className="flex flex-wrap items-center gap-2.5 px-4 py-3">
        <span
          className="min-w-0 text-[11.5px] leading-[1.5] text-fg-muted"
          title={live ? "Newest first while this run is active." : "Alphabetical by keyword."}
        >
          {items.length.toLocaleString("en-US")} {items.length === 1 ? "target" : "targets"}
        </span>
        {cursor && !summary.active ? (
          <Button onClick={onLoadMore} size="xs" variant="secondary">
            Load more
          </Button>
        ) : null}
      </footer>
    </section>
  );
}
