import type { LoadMoreBacklinkRowsAction } from "@/lib/actions/backlinks";
import type { BacklinksSnapshot } from "@/lib/backlinks/types";
import type { Dispatch, SetStateAction } from "react";

export async function loadMoreWorkspaceRows(
  action: LoadMoreBacklinkRowsAction,
  projectId: string,
  current: BacklinksSnapshot,
  addSpend: (cost: number) => void,
  setSnapshot: Dispatch<SetStateAction<BacklinksSnapshot | null>>,
) {
  const outcome = await action({
    includeSubdomains: current.includeSubdomains,
    limit: 100,
    snapshotRef: current.snapshotRef,
    projectId,
    provider: current.provider,
    target: current.target,
    targetScope: current.targetScope,
  });
  if (outcome.ok) {
    addSpend(outcome.costCents);
    setSnapshot((visible) =>
      visible && visible.snapshotRef === current.snapshotRef
        ? {
            ...visible,
            snapshotRef: outcome.snapshotRef,
            fetchedRowCount: outcome.fetchedRowCount,
            totalRowsAvailable: outcome.totalRowsAvailable,
            rows: [...visible.rows, ...outcome.rows],
          }
        : visible,
    );
  }
  return outcome;
}
