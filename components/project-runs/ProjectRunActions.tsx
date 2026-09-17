"use client";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
import { TERMINAL_RUN_STATUSES } from "@/lib/rank-check/runs/contract";
import type { ProjectRun } from "@/lib/runs/project-run";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

function isRunnable(run: ProjectRun) {
  return run.kind === "rank_check" && run.details.status === "planned";
}

function titleFor(run: ProjectRun, t: ReturnType<typeof useTranslations<"projectRuns">>) {
  if (run.title.kind === "gsc_import") return t("table.searchConsoleImport");
  if (run.title.trigger === "api") return t("table.rankCheckApi");
  if (run.title.trigger === "manual") return t("table.rankCheckManual");
  if (run.title.trigger === "retry") return t("table.rankCheckRetry");
  return t("table.rankCheckScheduled");
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
  const t = useTranslations("projectRuns");
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
            label: t("actions.deleteRun"),
            onSelect: () => setConfirmDelete(true),
          },
        ]
      : []),
    ...(run.capabilities.viewDetails
      ? [{ label: t("actions.viewDetails"), onSelect: () => router.push(run.href) }]
      : []),
    ...(canMutate && isRunnable(run)
      ? [
          { disabled: pending, label: t("actions.runNow"), onSelect: () => onRunNow(run) },
          { disabled: pending, label: t("actions.skipOnce"), onSelect: () => onSkip(run) },
        ]
      : []),
  ];
  return items.length ? (
    <>
      <RowActionsMenu
        ariaLabel={t("actions.actionsFor", { title: titleFor(run, t) })}
        items={items}
      />
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
