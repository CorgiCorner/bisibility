import type { ActiveSearchImportSnapshot } from "@/lib/search-insights/sync/operation-snapshot";
import type { ProjectRunsStatus } from "./filters";
import type { ProjectRunAttention, ProjectRunLifecycle } from "./project-run";

export const GSC_ACTIVE_IMPORT_STATES = ["queued", "running", "waiting_for_first_data"] as const;

const ACTIVE_LIFECYCLES = [
  "queued",
  "running",
  "cancelling",
  "waiting_for_first_data",
  "waiting_to_resume",
] as const;

export type GscActiveSnapshotRunState = Readonly<{
  attention: ProjectRunAttention | null;
  lifecycle: ProjectRunLifecycle;
}>;

export function gscActiveSnapshotRunState(
  snapshot: ActiveSearchImportSnapshot,
): GscActiveSnapshotRunState {
  switch (snapshot.presentation.kind) {
    case "needs_reauth":
      return { attention: { kind: "needs_reauthentication", message: null }, lifecycle: "paused" };
    case "needs_retry":
      return { attention: { kind: "failed", message: null }, lifecycle: "paused" };
    case "paused_user":
      return { attention: { kind: "paused", message: null }, lifecycle: "paused" };
    case "paused_provider":
      return { attention: null, lifecycle: "waiting_to_resume" };
    case "queued":
      return { attention: null, lifecycle: "queued" };
    case "running":
      return { attention: null, lifecycle: "running" };
    case "waiting_for_first_data":
      return { attention: null, lifecycle: "waiting_for_first_data" };
    case "waiting_worker":
      return {
        attention: { kind: "worker_unavailable", message: null },
        lifecycle: "status_unavailable",
      };
    case "complete":
    case "status_unavailable":
      return { attention: null, lifecycle: "status_unavailable" };
  }
}

export function rawGscSnapshotMatchesStatus(
  snapshot: ActiveSearchImportSnapshot,
  status: ProjectRunsStatus,
) {
  if (status === "all") return true;
  if (status === "finished") return false;
  if (status === "active") {
    return (
      (GSC_ACTIVE_IMPORT_STATES as readonly string[]).includes(snapshot.state) ||
      (snapshot.state === "paused" && snapshot.presentation.kind === "paused_provider")
    );
  }
  return (
    snapshot.state === "paused" &&
    ["needs_reauth", "needs_retry", "paused_user"].includes(snapshot.presentation.kind)
  );
}

export function gscSnapshotMatchesStatus(
  snapshot: ActiveSearchImportSnapshot,
  status: ProjectRunsStatus,
) {
  if (status === "all") return true;
  if (status === "finished") return false;
  const state = gscActiveSnapshotRunState(snapshot);
  if (status === "attention") return state.attention !== null;
  return (ACTIVE_LIFECYCLES as readonly string[]).includes(state.lifecycle);
}

export function adjustedGscCount(
  count: number,
  snapshot: ActiveSearchImportSnapshot | null,
  status: ProjectRunsStatus,
) {
  if (!snapshot) return count;
  return (
    count +
    Number(gscSnapshotMatchesStatus(snapshot, status)) -
    Number(rawGscSnapshotMatchesStatus(snapshot, status))
  );
}
