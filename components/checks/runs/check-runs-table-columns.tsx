"use client";

import { CheckStatusChip } from "@/components/ui/CheckStatusChip";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { Tooltip } from "@/components/ui/Tooltip";
import type { CheckRunRow } from "@/lib/checks/contract";
import { RESEARCH_METRICS_UNAVAILABLE_TOOLTIP } from "@/lib/serp/research-capability";
import { ArrowDownIcon as ArrowDown } from "@phosphor-icons/react/dist/ssr/ArrowDown";
import { ArrowUpIcon as ArrowUp } from "@phosphor-icons/react/dist/ssr/ArrowUp";
import Link from "next/link";
import type { ReactNode } from "react";
import { type CheckRunDetailLine, CountryLevelBadge } from "./CheckRunDetails";
import { formatResult, formatRunCost, formatWhen } from "./check-runs-format";
import type { RunTableColumns } from "./use-run-table-width";

export type CheckRunsTableRow = {
  detail?: CheckRunDetailLine;
  id: string;
  kind: "group" | "row" | "section";
  keyword: string;
  label: string;
  run: CheckRunRow;
  subRows?: readonly CheckRunsTableRow[];
};

type ColumnOptions = {
  columns: RunTableColumns;
  keywordHref: (keywordPublicId: string) => string;
  now: Date;
};

function PositionDelta({ run }: Readonly<{ run: CheckRunRow }>) {
  if (run.previousPosition === null || run.position === null) return null;
  const delta = run.previousPosition - run.position;
  if (delta === 0) {
    return (
      <span className="rounded bg-bg-inset px-1.5 py-0.5 font-sans tabular-nums text-[9.5px] text-fg-muted">
        0
      </span>
    );
  }
  const Icon = delta > 0 ? ArrowUp : ArrowDown;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 font-sans tabular-nums text-[9.5px] font-semibold ${
        delta > 0 ? "bg-green/10 text-green-text" : "bg-red/10 text-red-text"
      }`}
    >
      <Icon aria-hidden size={9} weight="regular" />
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
        <span className="rounded-full bg-yellow/10 px-1.5 py-0.5 font-sans tabular-nums text-[9.5px] font-semibold text-yellow-text">
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

function column(
  id: string,
  header: string,
  size: number,
  cell: (run: CheckRunRow) => ReactNode,
  options: { flex?: number; minSize?: number } = {},
): DataTableColumn<CheckRunsTableRow> {
  return {
    cell: ({ row }) => cell(row.original.run),
    enableSorting: false,
    header,
    id,
    meta: { flex: options.flex, sortable: false },
    minSize: options.minSize ?? size,
    size,
  };
}

export function checkRunsTableColumns({
  columns,
  keywordHref,
  now,
}: Readonly<ColumnOptions>): readonly DataTableColumn<CheckRunsTableRow>[] {
  const definitions: DataTableColumn<CheckRunsTableRow>[] = [
    column("status", "Status", 140, (run) => <CheckStatusChip kind={run.status} />, {
      minSize: 140,
    }),
    column(
      "keyword",
      "Keyword",
      148,
      (run) => (
        <Link
          className="block truncate font-semibold text-fg outline-none hover:text-accent-text focus-visible:text-accent-text"
          href={keywordHref(run.keywordPublicId)}
        >
          {run.keyword}
        </Link>
      ),
      { flex: 2, minSize: 144 },
    ),
    column(
      "location",
      "Location",
      132,
      (run) => (
        <span className="block truncate text-fg" title={run.location}>
          {run.location}
        </span>
      ),
      { flex: 2, minSize: 128 },
    ),
    column("language", "Language", 104, (run) => (
      <div className="min-w-0">
        <span className="block truncate text-fg-muted">{run.languageLabel ?? "-"}</span>
        {!run.researchMetricsAvailable ? (
          <Tooltip content={RESEARCH_METRICS_UNAVAILABLE_TOOLTIP}>
            <button
              aria-label={`no volume/KD: ${RESEARCH_METRICS_UNAVAILABLE_TOOLTIP}`}
              className="mt-1 inline-flex cursor-help rounded-full border border-dashed border-border-control bg-bg-sunken px-1.5 py-0.5 font-sans tabular-nums text-[9.5px] font-semibold text-fg-muted"
              type="button"
            >
              no volume/KD
            </button>
          </Tooltip>
        ) : null}
      </div>
    )),
    column("device", "Device", 72, (run) => (
      <span className="text-fg-muted">{run.device === "mobile" ? "Mobile" : "Desktop"}</span>
    )),
    column("result", "Result", 112, (run) => <ResultCell now={now} run={run} />, {
      minSize: 108,
    }),
    column("provider", "Provider", 132, (run) => <ProviderCell run={run} />, {
      flex: 1,
      minSize: 128,
    }),
  ];
  if (columns.depth) {
    definitions.push(
      column("depth", "Depth", 76, (run) => (
        <span className="font-sans tabular-nums text-[10.5px] text-fg-muted">
          {typeof run.requestedDepth === "number" ? `Top ${run.requestedDepth}` : "-"}
        </span>
      )),
    );
  }
  if (columns.cost) {
    definitions.push(
      column("cost", "Cost", 76, (run) => (
        <span className="font-sans tabular-nums text-[10.5px] text-fg-muted">
          <CostCell run={run} />
        </span>
      )),
    );
  }
  if (columns.when) {
    definitions.push(
      column("when", "When", 76, (run) => (
        <span className="font-sans tabular-nums text-[10.5px] text-fg-muted">
          {formatWhen(run, now)}
        </span>
      )),
    );
  }
  return definitions;
}
