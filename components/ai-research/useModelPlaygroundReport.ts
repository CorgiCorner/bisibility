"use client";
import {
  readModelPlaygroundRetainedResultAction,
  saveModelPlaygroundReportAction,
} from "@/lib/actions/research-history";
import type { ModelPlaygroundLaunchResult } from "@/lib/model-playground/launch-service";
import {
  type ReportSaveStatus,
  reportSaveStatusForReason,
} from "@/lib/model-playground/report-state";
import { useCallback, useEffect, useRef, useState } from "react";

type SavedRun = { status: ReportSaveStatus; reportId?: string };
export function useModelPlaygroundReport(
  projectRef: string,
  run: ModelPlaygroundLaunchResult | null,
) {
  const [reports, setReports] = useState<Record<string, SavedRun>>({});
  const [retained, setRetained] = useState<ModelPlaygroundLaunchResult | null>(null);
  const [checkRevision, setCheckRevision] = useState(0);
  const states = useRef(reports);
  states.current = reports;
  const explicitReadOnly = useRef<Record<string, true>>({});
  const save = useCallback(
    async (runId: string, explicit = true) => {
      setReports((current) => ({ ...current, [runId]: { status: "saving" } }));
      try {
        const result = await saveModelPlaygroundReportAction({ projectRef, runId, explicit });
        const state: SavedRun = result.ok
          ? { status: "saved", reportId: result.reportId }
          : { status: reportSaveStatusForReason(result.reason) };
        if (result.ok) delete explicitReadOnly.current[runId];
        else if (explicit && (result.reason === "read_only" || result.reason === "held"))
          explicitReadOnly.current[runId] = true;
        states.current = { ...states.current, [runId]: state };
        setReports((current) => ({ ...current, [runId]: state }));
      } catch {
        states.current = { ...states.current, [runId]: { status: "storage" } };
        setReports((current) => ({ ...current, [runId]: { status: "storage" } }));
      }
    },
    [projectRef],
  );
  const runId = run?.runId;
  // Synchronize the retained server run with this subscriber; no execution or paid retry.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Manual checks restart this bounded subscription.
  useEffect(() => {
    if (!runId) return;
    let active = true;
    let attempts = 0;
    let windows = 0;
    let scheduledReadyAt = 0;
    let followedUp = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (
      status: "pending" | "check_failed",
      readyAt?: string | null,
      readyInMs?: number | null,
    ) => {
      const at = readyAt ? Date.parse(readyAt) : NaN;
      const future = typeof readyInMs === "number" && Number.isFinite(readyInMs) && readyInMs > 0;
      const newWindow = Number.isFinite(at) && at > scheduledReadyAt;
      // One later window is a real rerun. A third advertised window is unknown timing.
      if (
        future &&
        Number.isFinite(at) &&
        (newWindow || !followedUp) &&
        !(newWindow && windows >= 2)
      ) {
        if (newWindow) {
          windows += 1;
          scheduledReadyAt = at;
          followedUp = false;
        } else followedUp = true;
        timer = setTimeout(() => void read(), Math.min(readyInMs, 2_147_483_647));
        return;
      }
      if (scheduledReadyAt) attempts = 6;
      if (attempts < 6) timer = setTimeout(() => void read(), 1500 * 2 ** (attempts - 1));
      else {
        states.current = { ...states.current, [runId]: { status } };
        setReports((current) => ({ ...current, [runId]: { status } }));
      }
    };
    const read = async () => {
      attempts++;
      try {
        const response = await readModelPlaygroundRetainedResultAction({ projectRef, runId });
        if (!active) return;
        if (!response.ok) {
          if (response.reason === "forbidden")
            setReports((current) => ({ ...current, [runId]: { status: "forbidden" } }));
          else if (response.reason === "storage") schedule("check_failed");
          else setReports((current) => ({ ...current, [runId]: { status: "unavailable" } }));
          return;
        }
        setRetained({ runId, columns: response.columns });
        if (response.terminal) {
          const state = states.current[runId]?.status;
          if (!state || ["pending", "check_failed", "read_only"].includes(state))
            void save(runId, state === "read_only" && explicitReadOnly.current[runId] === true);
        } else {
          setReports((current) =>
            current[runId] ? current : { ...current, [runId]: { status: "pending" } },
          );
          schedule("pending", response.readyAt, response.readyInMs);
        }
      } catch {
        if (active) schedule("check_failed");
      }
    };
    void read();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [runId, projectRef, save, checkRevision]);
  const latest = retained?.runId === runId ? retained : run;
  const paidColumns = new Map(latest?.columns.map((column) => [column.column.columnId, column]));
  for (const column of run?.columns ?? []) {
    if (column.answer !== null || !paidColumns.has(column.column.columnId))
      paidColumns.set(column.column.columnId, column);
  }
  return {
    save,
    checkAgain: () => setCheckRevision((revision) => revision + 1),
    status: runId ? reports[runId]?.status : undefined,
    reportId: run?.reportId ?? (runId ? reports[runId]?.reportId : undefined),
    result: latest ? { ...latest, columns: [...paidColumns.values()] } : null,
  };
}
