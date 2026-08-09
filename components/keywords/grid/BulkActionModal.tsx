"use client";

import type { KeywordWorkspaceActions } from "@/components/keywords/action-utils";
import { Modal } from "@/components/ui";
import type { CostRateInfo } from "@/lib/cost-estimate/project-estimate";
import type { KeywordRow } from "@/lib/queries/keywords";
import { BulkFrequencyForm, BulkTagForm } from "./BulkActionForms";
import { BulkTargetForm } from "./BulkTargetForm";
import { bulkTargetView } from "./bulk-target-model";

export type BulkMode = "frequency" | "tag" | "target" | null;

const staticTitles = {
  frequency: "Set check frequency",
  tag: "Add tag",
} as const;

type BulkActionModalProps = Pick<
  KeywordWorkspaceActions,
  "bulkSetFrequencyAction" | "bulkSetTargetAction" | "bulkTagAction"
> & {
  actionError: string | null;
  mode: BulkMode;
  onClose: () => void;
  onDone: () => void;
  onError: (message: string | null) => void;
  onRequestClearTarget: () => void;
  projectId: string;
  providerRate?: CostRateInfo;
  selectedRows: KeywordRow[];
};

export function BulkActionModal({
  actionError,
  bulkSetFrequencyAction,
  bulkSetTargetAction,
  bulkTagAction,
  mode,
  onClose,
  onDone,
  onError,
  onRequestClearTarget,
  projectId,
  providerRate,
  selectedRows,
}: Readonly<BulkActionModalProps>) {
  const selectedIds = selectedRows.map((row) => row.id);
  const title =
    mode === "target" ? bulkTargetView(selectedRows).modalTitle : mode && staticTitles[mode];

  return (
    <Modal onClose={onClose} open={mode !== null} title={title || undefined}>
      <div className="grid gap-3">
        <p className="m-0 font-mono text-[11.5px] text-fg-muted">
          Applies to {selectedRows.length} selected keyword{selectedRows.length === 1 ? "" : "s"}.
        </p>
        {mode === "tag" ? (
          <BulkTagForm
            action={bulkTagAction}
            key={`tag-${selectedIds.join("|")}`}
            onDone={onDone}
            onError={onError}
            projectId={projectId}
            selectedIds={selectedIds}
          />
        ) : null}
        {mode === "target" ? (
          <BulkTargetForm
            action={bulkSetTargetAction}
            key={`target-${selectedIds.join("|")}`}
            onDone={onDone}
            onError={onError}
            onRequestClear={onRequestClearTarget}
            projectId={projectId}
            selectedRows={selectedRows}
          />
        ) : null}
        {mode === "frequency" ? (
          <BulkFrequencyForm
            action={bulkSetFrequencyAction}
            key={`frequency-${selectedIds.join("|")}`}
            onDone={onDone}
            onError={onError}
            projectId={projectId}
            providerRate={providerRate}
            selectedRows={selectedRows}
          />
        ) : null}
        {actionError ? (
          <p className="m-0 font-mono text-[11.5px] text-red-text">{actionError}</p>
        ) : null}
      </div>
    </Modal>
  );
}
