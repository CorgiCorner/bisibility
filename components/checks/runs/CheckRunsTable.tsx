"use client";

import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableSort } from "@/components/ui/data-table/data-table-types";
import type { CheckRunFilter, CheckRunRow, CheckRunsView } from "@/lib/checks/contract";
import { useMemo } from "react";
import { checkRunDetailLines } from "./CheckRunDetails";
import { totalForFilter } from "./check-runs-format";
import { type CheckRunsTableRow, checkRunsTableColumns } from "./check-runs-table-columns";
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

type RunRowOptions = Pick<TableProps, "keywordHref" | "now"> & { columns: RunTableColumns };

function canExpandRun(run: CheckRunRow, columns: RunTableColumns) {
  return (
    run.status === "failed" ||
    run.viaFallback ||
    !columns.depth ||
    !columns.cost ||
    !columns.when ||
    (run.storedResults !== null && run.storedResults.tier !== "none")
  );
}

function checkRunsTableRows(
  runs: readonly CheckRunRow[],
  options: RunRowOptions,
): CheckRunsTableRow[] {
  return runs.map((run) => {
    if (!canExpandRun(run, options.columns)) {
      return { id: run.id, kind: "row", keyword: run.keyword, label: `${run.keyword} run`, run };
    }
    return {
      id: run.id,
      kind: "group",
      keyword: run.keyword,
      label: `${run.keyword} run`,
      run,
      subRows: checkRunDetailLines({
        ...options,
        keywordHref: options.keywordHref(run.keywordPublicId),
        run,
      }).map((detail) => ({
        detail,
        id: detail.id,
        kind: "section",
        keyword: run.keyword,
        label: `${run.keyword} run`,
        run,
      })),
    };
  });
}

function renderSection(row: CheckRunsTableRow) {
  return row.detail?.content ?? null;
}

function changedExpandedRunId(current: ReadonlySet<string>, next: ReadonlySet<string>) {
  return (
    [...next].find((runId) => !current.has(runId)) ??
    [...current].find((runId) => !next.has(runId)) ??
    null
  );
}

function ignoreSorting(_: DataTableSort | null) {}

export function CheckRunsTable(props: Readonly<TableProps>) {
  const { columns: visibleColumns, containerRef } = useRunTableWidth();
  const columns = useMemo(
    () =>
      checkRunsTableColumns({
        columns: visibleColumns,
        keywordHref: props.keywordHref,
        now: props.now,
      }),
    [props.keywordHref, props.now, visibleColumns],
  );
  const rows = useMemo(
    () =>
      checkRunsTableRows(props.view.rows, {
        columns: visibleColumns,
        keywordHref: props.keywordHref,
        now: props.now,
      }),
    [props.keywordHref, props.now, props.view.rows, visibleColumns],
  );
  const canLoadMore = props.view.nextCursor !== null;
  const loadKey = props.view.nextCursor
    ? `${props.view.rows.length}:${props.view.nextCursor.id}`
    : `${props.view.rows.length}:complete`;
  const sentinelRef = useAutoLoadMore(canLoadMore, loadKey, props.onLoadMore);
  const total = totalForFilter(props.filter, props.view.counts);

  return (
    <>
      <div className="[&>[role=table]]:border-0" ref={containerRef}>
        <DataTable
          ariaLabel="Check runs"
          columns={columns}
          expanded={props.expandedRunIds}
          id="check-runs-table"
          layout="auto"
          onExpandedChange={(next) => {
            const runId = changedExpandedRunId(props.expandedRunIds, next);
            if (runId) props.onToggleRun(runId);
          }}
          onSortingChange={ignoreSorting}
          renderSection={renderSection}
          rows={rows}
          sorting={null}
        />
      </div>
      <div aria-hidden className="h-px" ref={sentinelRef} />
      <footer className="flex flex-col gap-3 border-t border-border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
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
