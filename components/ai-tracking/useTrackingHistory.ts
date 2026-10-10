"use client";
import { mergeTrackingRows } from "@/lib/ai-tracking/projections/pagination";
import type { TrackingRunRow, TrackingSampleRow } from "@/lib/ai-tracking/projections/workspace";
import type { TrackingWorkspaceActions } from "@/lib/ai-tracking/projections/workspace-actions";
import { useRef, useState, useTransition } from "react";

export function useTrackingHistory(
  initialRuns: TrackingRunRow[],
  initialCursor: string | null,
  initialSamples: TrackingSampleRow[],
  actions: TrackingWorkspaceActions,
) {
  const [moreRuns, setMoreRuns] = useState<TrackingRunRow[]>([]);
  const [runCursor, setRunCursor] = useState<string | null | undefined>();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(
    initialSamples.length ? (initialRuns[0]?.id ?? null) : null,
  );
  const [samples, setSamples] = useState(initialSamples);
  const [sampleCursor, setSampleCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const version = useRef(0);
  const cursor = runCursor === undefined ? initialCursor : runCursor;
  const runs = mergeTrackingRows(moreRuns, initialRuns).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  function selectRun(id: string) {
    const request = ++version.current;
    setSelectedRunId(id);
    setSamples([]);
    setSampleCursor(null);
    setError(null);
    startTransition(async () => {
      try {
        const page = await actions.samples(id);
        if (version.current !== request) return;
        setSamples(mergeTrackingRows([], page.items));
        setSampleCursor(page.nextCursor);
      } catch (cause) {
        if (version.current === request)
          setError(String(cause instanceof Error ? cause.message : cause));
      }
    });
  }
  function loadSamples() {
    if (!sampleCursor || !selectedRunId || pending) return;
    const request = version.current;
    const id = selectedRunId;
    startTransition(async () => {
      try {
        const page = await actions.samples(id, sampleCursor);
        if (version.current !== request) return;
        if (page.nextCursor === sampleCursor) throw new Error("Sample pagination did not advance.");
        setSamples((before) => mergeTrackingRows(before, page.items));
        setSampleCursor(page.nextCursor);
        setError(null);
      } catch (cause) {
        if (version.current === request)
          setError(String(cause instanceof Error ? cause.message : cause));
      }
    });
  }
  function loadRuns() {
    if (!cursor || pending) return;
    startTransition(async () => {
      try {
        const page = await actions.runs(cursor);
        if (page.nextCursor === cursor) throw new Error("Run pagination did not advance.");
        setMoreRuns((before) => mergeTrackingRows(before, page.items));
        setRunCursor(page.nextCursor);
        setError(null);
      } catch (cause) {
        setError(String(cause instanceof Error ? cause.message : cause));
      }
    });
  }
  return {
    runs,
    samples,
    selectedRunId,
    expected: runs.find((run) => run.id === selectedRunId)?.sampleCount ?? 0,
    runCursor: cursor,
    sampleCursor,
    pending,
    error,
    selectRun,
    loadRuns,
    loadSamples,
  };
}
