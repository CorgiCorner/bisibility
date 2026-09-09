import type { OperationSnapshot } from "@/lib/rank-check/runs/contract";
import type { ProjectRun } from "@/lib/runs/project-run";

type GscImportOperation = Extract<OperationSnapshot, { kind: "gsc_import" }>;

export type ProjectRunSnapshotTone = "attention" | "critical" | "info" | "neutral" | "positive";

export type ProjectRunWithOperationSnapshot = ProjectRun &
  Readonly<{
    snapshotPresentationTitle?: GscImportOperation["presentation"]["title"];
    snapshotPresentationTone?: ProjectRunSnapshotTone;
  }>;

const gscSnapshotTones = {
  Completed: "positive",
  Delayed: "attention",
  Failed: "critical",
  Importing: "info",
  Paused: "attention",
  Queued: "info",
  "Reconnect required": "critical",
  "Status unavailable": "neutral",
  "Waiting for Google": "attention",
  "Waiting for data": "info",
} as const satisfies Record<GscImportOperation["presentation"]["title"], ProjectRunSnapshotTone>;

/** Keeps the one active import's qualifying coverage aligned with the operations tray. */
export function applyOperationSnapshotToRuns(
  runs: readonly ProjectRun[],
  operations: readonly OperationSnapshot[],
): ProjectRunWithOperationSnapshot[] {
  const imports = new Map<string, GscImportOperation>();
  for (const operation of operations) {
    if (operation.kind === "gsc_import") imports.set(operation.id, operation);
  }

  return runs.map((run) => {
    if (run.kind !== "gsc_import") return run;
    const operation = imports.get(run.id);
    if (!operation) return run;
    return {
      ...run,
      progress: {
        completed: operation.progress.done,
        total: operation.progress.total,
        unit: "days",
      },
      snapshotPresentationTitle: operation.presentation.title,
      snapshotPresentationTone: gscSnapshotTones[operation.presentation.title],
    };
  });
}
