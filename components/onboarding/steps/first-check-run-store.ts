import type { FirstCheckCandidate } from "@/lib/actions/rank-check-preview-result";
import { readFirstCheckProgress, type TrackedFirstCheck } from "./first-check-progress";
import {
  type FirstCheckRunState,
  initialFirstCheckRunState,
  pendingRow,
  previewRow,
} from "./first-check-run-rows";

type TrackedRun = {
  projectId: string;
  row: TrackedFirstCheck;
  controller?: AbortController;
  timer?: ReturnType<typeof setTimeout>;
  failures: number;
};
type Update = FirstCheckRunState | ((state: FirstCheckRunState) => FirstCheckRunState);
const runKey = (row: TrackedFirstCheck) => `${row.runId}:${row.publicId}`;
const statusUnavailable =
  "Could not refresh the check status. Retrying automatically. You can open the app while it finishes.";

export function firstCheckRowsStatus(
  rows: FirstCheckRunState["rows"],
): FirstCheckRunState["status"] {
  if (rows.some((row) => row.status === "pending" || row.status === "running")) return "running";
  if (rows.some((row) => row.status === "queued")) return "queued";
  return rows.some((row) => row.status === "ready") ? "idle" : "completed";
}

export function createFirstCheckRunStore(
  candidates: FirstCheckCandidate[] = [],
  projectId?: string | null,
) {
  const rows: FirstCheckRunState["rows"] = candidates.some((candidate) => candidate.previousResult)
    ? candidates.map((candidate) =>
        candidate.previousResult
          ? previewRow(candidate, candidate.previousResult)
          : { ...pendingRow(candidate), status: "ready" },
      )
    : [];
  const initialState: FirstCheckRunState = {
    ...initialFirstCheckRunState,
    rows,
    status: rows.length > 0 ? firstCheckRowsStatus(rows) : "idle",
  };
  let state = initialState;
  const listeners = new Set<() => void>();
  const runs = new Map<string, TrackedRun>();
  for (const row of rows) {
    if (row.status === "queued" && projectId)
      runs.set(runKey(row), { row, projectId, failures: 0 });
  }
  function setState(update: Update) {
    state = typeof update === "function" ? update(state) : update;
    for (const listener of listeners) listener();
  }
  function schedule(run: TrackedRun, delay = 0) {
    if (!listeners.size || run.controller || run.timer) return;
    run.timer = setTimeout(() => {
      run.timer = undefined;
      void poll(run);
    }, delay);
  }
  async function poll(run: TrackedRun) {
    const controller = new AbortController();
    run.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const row = await readFirstCheckProgress(run.projectId, run.row, controller.signal);
      if (controller.signal.aborted || run.controller !== controller) return;
      run.failures = 0;
      if (row.status !== "queued" && row.status !== "running") runs.delete(runKey(run.row));
      setState((current) => {
        const rows = current.rows.map((existing) =>
          "runId" in existing &&
          existing.runId === run.row.runId &&
          existing.publicId === run.row.publicId
            ? row
            : existing,
        );
        return {
          ...current,
          rows,
          status: firstCheckRowsStatus(rows),
          message: [...runs.values()].some((entry) => entry.failures > 0)
            ? statusUnavailable
            : null,
        };
      });
    } catch {
      if (run.controller !== controller) return;
      run.failures += 1;
      setState((current) => ({ ...current, message: statusUnavailable }));
    } finally {
      clearTimeout(timeout);
      if (run.controller === controller) {
        run.controller = undefined;
        if (runs.has(runKey(run.row))) schedule(run, Math.min(2_000 * 2 ** run.failures, 30_000));
      }
    }
  }
  return {
    getSnapshot: () => state,
    getServerSnapshot: () => initialState,
    setState,
    track(projectId: string, row: TrackedFirstCheck) {
      if (runs.has(runKey(row))) return;
      const run: TrackedRun = { projectId, row, failures: 0 };
      runs.set(runKey(row), run);
      schedule(run);
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      for (const run of runs.values()) schedule(run);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        for (const run of runs.values()) {
          clearTimeout(run.timer);
          run.timer = undefined;
          run.controller?.abort();
          run.controller = undefined;
        }
      };
    },
  };
}
