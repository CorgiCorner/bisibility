"use client";

import { Button, CheckStatusChip, Tooltip, tableHeaderClassName } from "@/components/ui";
import type { CheckRunFilter, CheckRunRow, CheckRunsView } from "@/lib/checks/contract";
import { RESEARCH_METRICS_UNAVAILABLE_TOOLTIP } from "@/lib/serp/market-capability";
import {
  ArrowDownIcon as ArrowDown,
  ArrowUpIcon as ArrowUp,
  CaretDownIcon as CaretDown,
  CaretRightIcon as CaretRight,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Fragment } from "react";
import { CheckRunDetails, CountryLevelBadge } from "./CheckRunDetails";
import { formatResult, formatRunCost, formatWhen, totalForFilter } from "./check-runs-format";
import { useAutoLoadMore } from "./use-auto-load-more";
import { type RunTableColumns, useRunTableWidth } from "./use-run-table-width";

type TableProps = {
  expandedRunIds: ReadonlySet<string>;
  filter: CheckRunFilter;
  keywordHref: (keywordPublicId: string) => string;
  now: Date;
  onLoadMore: () => void;
  onToggleRun: (runId: string) => void;
  view: CheckRunsView;
};

function tableHeaders(columns: RunTableColumns) {
  return [
    "Status",
    "Keyword",
    "Location",
    "Language",
    "Device",
    "Result",
    "Provider",
    columns.depth ? "Depth" : null,
    columns.cost ? "Cost" : null,
    columns.when ? "When" : null,
    "",
  ].filter((header): header is string => header !== null);
}

function PositionDelta({ run }: Readonly<{ run: CheckRunRow }>) {
  if (run.previousPosition === null || run.position === null) return null;
  const delta = run.previousPosition - run.position;
  if (delta === 0) {
    return (
      <span className="rounded bg-bg-inset px-1.5 py-0.5 font-mono text-[9.5px] text-fg-muted">
        0
      </span>
    );
  }
  const Icon = delta > 0 ? ArrowUp : ArrowDown;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[9.5px] font-semibold ${
        delta > 0 ? "bg-green/10 text-green-text" : "bg-red/10 text-red-text"
      }`}
    >
      <Icon aria-hidden size={9} weight="bold" />
      {Math.abs(delta)}
    </span>
  );
}

function ProviderCell({ run }: Readonly<{ run: CheckRunRow }>) {
  const label =
    run.status === "failed" && run.attemptCount > 1
      ? `${run.attemptCount} providers`
      : run.providerLabel;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <span className="truncate">{label}</span>
      {run.viaFallback ? (
        <span className="rounded-full bg-yellow/10 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-yellow-text">
          fallback
        </span>
      ) : null}
      {run.degradedToCountry ? <CountryLevelBadge /> : null}
    </div>
  );
}

function ResultCell({ now, run }: Readonly<{ now: Date; run: CheckRunRow }>) {
  const value = formatResult(run, now);
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span
        className={`min-w-0 truncate ${run.status === "failed" ? "text-red-text" : "text-fg"}`}
        title={value}
      >
        {value}
      </span>
      {run.status === "completed" ? <PositionDelta run={run} /> : null}
    </div>
  );
}

function CostCell({ run }: Readonly<{ run: CheckRunRow }>) {
  if (run.status !== "failed") return <>{formatRunCost(run)}</>;
  return (
    <Tooltip content="Not billed - no attempt completed">
      <span aria-label="Not billed - no attempt completed" className="cursor-help">
        -
      </span>
    </Tooltip>
  );
}

function RunCells({
  columns,
  keywordHref,
  now,
  run,
}: Readonly<{
  columns: RunTableColumns;
  keywordHref: TableProps["keywordHref"];
  now: Date;
  run: CheckRunRow;
}>) {
  return (
    <>
      <td className="px-3 py-3">
        <CheckStatusChip kind={run.status} />
      </td>
      <td className="min-w-0 px-3 py-3">
        <Link
          className="block truncate font-semibold text-fg outline-none hover:text-accent-text focus-visible:text-accent-text"
          href={keywordHref(run.keywordPublicId)}
        >
          {run.keyword}
        </Link>
      </td>
      <td className="min-w-0 px-3 py-3">
        <span className="block truncate text-fg" title={run.location}>
          {run.location}
        </span>
      </td>
      <td className="min-w-0 px-3 py-3">
        <span className="block truncate text-fg-muted">{run.languageLabel ?? "-"}</span>
        {!run.researchMetricsAvailable ? (
          <Tooltip content={RESEARCH_METRICS_UNAVAILABLE_TOOLTIP}>
            <button
              aria-label={`no volume/KD: ${RESEARCH_METRICS_UNAVAILABLE_TOOLTIP}`}
              className="mt-1 inline-flex cursor-help rounded-full border border-dashed border-border-strong bg-bg-sunken px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-fg-muted"
              type="button"
            >
              no volume/KD
            </button>
          </Tooltip>
        ) : null}
      </td>
      <td className="px-3 py-3 text-fg-muted">{run.device === "mobile" ? "Mobile" : "Desktop"}</td>
      <td className="min-w-0 px-3 py-3">
        <ResultCell now={now} run={run} />
      </td>
      <td className="min-w-0 px-3 py-3">
        <ProviderCell run={run} />
      </td>
      {columns.depth ? (
        <td className="px-3 py-3 font-mono text-[10.5px] text-fg-muted">
          {typeof run.requestedDepth === "number" ? `Top ${run.requestedDepth}` : "-"}
        </td>
      ) : null}
      {columns.cost ? (
        <td className="px-3 py-3 font-mono text-[10.5px] text-fg-muted">
          <CostCell run={run} />
        </td>
      ) : null}
      {columns.when ? (
        <td className="px-3 py-3 font-mono text-[10.5px] text-fg-muted">{formatWhen(run, now)}</td>
      ) : null}
    </>
  );
}

function RunTableBody({
  columns,
  expandedRunIds,
  keywordHref,
  now,
  onToggleRun,
  rows,
}: Readonly<
  Pick<TableProps, "expandedRunIds" | "keywordHref" | "now" | "onToggleRun"> & {
    columns: RunTableColumns;
    rows: CheckRunRow[];
  }
>) {
  const hiddenColumns = !columns.depth || !columns.cost || !columns.when;
  const columnCount = tableHeaders(columns).length;
  return (
    <tbody className="divide-y divide-border-soft">
      {rows.map((run) => {
        const expandable = run.status === "failed" || run.viaFallback || hiddenColumns;
        const expanded = expandable && expandedRunIds.has(run.id);
        return (
          <Fragment key={run.id}>
            <tr className="text-[12px] hover:bg-bg-sunken/55">
              <RunCells columns={columns} keywordHref={keywordHref} now={now} run={run} />
              <td className="px-2 py-3 text-right">
                {expandable ? (
                  <button
                    aria-expanded={expanded}
                    aria-label={`${expanded ? "Collapse" : "Expand"} ${run.keyword} run`}
                    className="inline-grid h-7 w-7 place-items-center rounded-lg text-fg-muted hover:bg-bg-inset hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid"
                    onClick={() => onToggleRun(run.id)}
                    type="button"
                  >
                    {expanded ? (
                      <CaretDown aria-hidden size={14} />
                    ) : (
                      <CaretRight aria-hidden size={14} />
                    )}
                  </button>
                ) : null}
              </td>
            </tr>
            {expanded ? (
              <tr>
                <td colSpan={columnCount} className="p-0">
                  <CheckRunDetails columns={columns} now={now} run={run} />
                </td>
              </tr>
            ) : null}
          </Fragment>
        );
      })}
    </tbody>
  );
}

export function CheckRunsTable(props: Readonly<TableProps>) {
  const { columns, containerRef } = useRunTableWidth();
  const canLoadMore = props.view.nextCursor !== null;
  const loadKey = props.view.nextCursor
    ? `${props.view.rows.length}:${props.view.nextCursor.id}`
    : `${props.view.rows.length}:complete`;
  const sentinelRef = useAutoLoadMore(canLoadMore, loadKey, props.onLoadMore);
  const total = totalForFilter(props.filter, props.view.counts);

  return (
    <>
      <div className="overflow-x-auto border-border border-y" ref={containerRef}>
        {/* 900px leaves about 125px for each of six flexible data columns after fixed status and action columns. */}
        <table aria-label="Check runs" className="w-full min-w-[900px] table-fixed border-collapse">
          <thead className={`text-left ${tableHeaderClassName}`}>
            <tr>
              {tableHeaders(columns).map((header, index) => (
                <th
                  className={`px-3 py-2.5 font-semibold ${index === 0 ? "w-[105px]" : ""} ${
                    index === tableHeaders(columns).length - 1 ? "w-11" : ""
                  }`}
                  key={`${header}-${index}`}
                  scope="col"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <RunTableBody columns={columns} {...props} rows={props.view.rows} />
        </table>
      </div>
      <div ref={sentinelRef} aria-hidden className="h-px" />
      <footer className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="m-0 text-[12px] font-semibold text-fg">
            Showing {props.view.rows.length.toLocaleString("en-US")} of{" "}
            {total.toLocaleString("en-US")} checks
          </p>
          <p className="m-0 mt-0.5 text-[10.5px] text-fg-muted">
            Older runs load as you scroll. Choose an earlier date above for older history.
          </p>
        </div>
        <Button disabled={!canLoadMore} onClick={props.onLoadMore} size="sm" variant="secondary">
          Load 50 more
        </Button>
      </footer>
    </>
  );
}
