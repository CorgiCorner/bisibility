"use client";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
import { TERMINAL_RUN_STATUSES } from "@/lib/rank-check/runs/contract";
import type { ProjectRun } from "@/lib/runs/project-run";
import { useRouter } from "next/navigation";
import { useState } from "react";

function isRunnable(run: ProjectRun) {
  return run.kind === "rank_check" && run.details.status === "planned";
}

export function RunActions({
  canMutate,
  onDelete,
  onRunNow,
  onSkip,
  pendingRunId,
  run,
}: Readonly<{
  canMutate: boolean;
  onDelete?: (run: ProjectRun) => Promise<void>;
  onRunNow: (run: ProjectRun) => void;
  onSkip: (run: ProjectRun) => void;
  pendingRunId: string | null;
  run: ProjectRun;
}>) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pending = pendingRunId === run.id;
  const items = [
    ...(onDelete &&
    run.kind === "rank_check" &&
    TERMINAL_RUN_STATUSES.some((status) => status === run.details.status)
      ? [
          {
            danger: true,
            disabled: pending,
            label: "Delete run",
            onSelect: () => setConfirmDelete(true),
          },
        ]
      : []),
    ...(run.capabilities.viewDetails
      ? [{ label: "View details", onSelect: () => router.push(run.href) }]
      : []),
    ...(canMutate && isRunnable(run)
      ? [
          { disabled: pending, label: "Run now", onSelect: () => onRunNow(run) },
          { disabled: pending, label: "Skip once", onSelect: () => onSkip(run) },
        ]
      : []),
  ];
  return items.length ? (
    <>
      <RowActionsMenu ariaLabel={`Actions for ${run.title}`} items={items} />
      <ConfirmModal
        open={confirmDelete}
        kind="deleteRun"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await onDelete?.(run);
          setConfirmDelete(false);
        }}
      />
    </>
  ) : (
    <span className="text-fg-muted">-</span>
  );
}
