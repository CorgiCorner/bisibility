"use client";

import { Profiler, type ProfilerOnRenderCallback, useCallback, useMemo, useRef } from "react";
import { DataTable } from "./DataTable";
import {
  createPerformanceStoryRows,
  type DataTableStoryRow,
  dataTableStoryColumns,
} from "./data-table-story-fixtures";
import type { DataTableColumn, DataTableSort } from "./data-table-types";

function percentile95(samples: readonly number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

export function DataTablePerformanceStory() {
  const frameDeadline = useRef(0);
  const frameRequest = useRef<number | null>(null);
  const frameOutput = useRef<HTMLOutputElement | null>(null);
  const frameSamples = useRef<number[]>([]);
  const lastFrame = useRef<number | null>(null);
  const rowCellCommitOutput = useRef<HTMLOutputElement | null>(null);
  const rowCellSubtreeCommits = useRef(0);
  const rows = useMemo(() => createPerformanceStoryRows(), []);

  const recordRowCellSubtreeCommit: ProfilerOnRenderCallback = useCallback((_id, phase) => {
    if (phase === "mount") return;
    rowCellSubtreeCommits.current += 1;
    if (rowCellCommitOutput.current) {
      rowCellCommitOutput.current.dataset.count = String(rowCellSubtreeCommits.current);
      rowCellCommitOutput.current.textContent = `Row-cell subtree commits: ${rowCellSubtreeCommits.current}`;
    }
  }, []);

  const columns = useMemo<readonly DataTableColumn<DataTableStoryRow>[]>(
    () =>
      dataTableStoryColumns.map((column) =>
        column.id === "keyword"
          ? {
              ...column,
              cell: ({ row }) => (
                <Profiler id={`row-cell-${row.original.id}`} onRender={recordRowCellSubtreeCommit}>
                  <a
                    className="truncate font-medium text-fg hover:underline"
                    href={`#performance-row-${row.original.id}`}
                    onClick={(event) => event.preventDefault()}
                  >
                    {row.original.keyword}
                  </a>
                </Profiler>
              ),
            }
          : column,
      ),
    [recordRowCellSubtreeCommit],
  );

  const startFrameSampling = useCallback(() => {
    frameDeadline.current = performance.now() + 400;
    if (frameRequest.current !== null) return;
    frameSamples.current = [];
    lastFrame.current = null;
    const sample = (now: number) => {
      if (lastFrame.current !== null) frameSamples.current.push(now - lastFrame.current);
      lastFrame.current = now;
      if (now < frameDeadline.current) {
        frameRequest.current = requestAnimationFrame(sample);
        return;
      }
      frameRequest.current = null;
      const p95 = percentile95(frameSamples.current);
      if (frameOutput.current) {
        frameOutput.current.dataset.p95 = p95.toFixed(2);
        frameOutput.current.dataset.samples = String(frameSamples.current.length);
        frameOutput.current.textContent = `Wheel RAF p95: ${p95.toFixed(2)}ms (${frameSamples.current.length} frames)`;
      }
    };
    frameRequest.current = requestAnimationFrame(sample);
  }, []);

  const boundaryRef = useCallback((node: HTMLDivElement | null) => {
    if (node || frameRequest.current === null) return;
    cancelAnimationFrame(frameRequest.current);
    frameRequest.current = null;
  }, []);

  const resetRowCellSubtreeCommits = () => {
    rowCellSubtreeCommits.current = 0;
    if (rowCellCommitOutput.current) {
      rowCellCommitOutput.current.dataset.count = "0";
      rowCellCommitOutput.current.textContent = "Row-cell subtree commits: 0";
    }
  };

  return (
    <section className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-fg-muted">
        <button
          className="rounded-control border border-border-control px-3 py-2 text-fg"
          onClick={resetRowCellSubtreeCommits}
          type="button"
        >
          Reset row-cell subtree commits
        </button>
        <output data-count="0" data-testid="performance-row-cell-commits" ref={rowCellCommitOutput}>
          Row-cell subtree commits: 0
        </output>
        <output
          data-p95="0"
          data-samples="0"
          data-testid="performance-frame-samples"
          ref={frameOutput}
        >
          Wheel inside the table to record frame timing
        </output>
      </div>
      <p className="text-[11px] text-fg-muted">
        1,000 groups and 10,000 leaves. Each profiler wraps a visible row-cell subtree; wheel timing
        samples browser animation frames while the table is scrolling.
      </p>
      <div
        className="h-[620px] min-h-[420px] min-w-0 max-h-[calc(100dvh-200px)]"
        onWheelCapture={startFrameSampling}
        ref={boundaryRef}
      >
        <DataTable
          ariaLabel="Ten thousand grouped rows performance table"
          columns={columns}
          defaultExpanded="all"
          id="performance-10k"
          layout="fill"
          onSortingChange={(_sorting: DataTableSort | null) => undefined}
          pagination={null}
          rows={rows}
          sorting={null}
        />
      </div>
    </section>
  );
}
