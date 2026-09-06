"use client";

import type { KeywordWorkspaceActions } from "@/components/keywords/action-utils";
import { Button, Modal } from "@/components/ui";
import type { KeywordRow } from "@/lib/queries/keywords";
import { useState } from "react";
import { BulkTagForm } from "./BulkActionForms";
import { BulkTargetForm } from "./BulkTargetForm";
import { bulkTargetView } from "./bulk-target-model";

export type BulkMode = "tag" | "target" | null;

const BULK_KEYWORD_FORM_ID = "bulk-keyword-action";

const staticTitles = { tag: "Add tag" } as const;

const submitCopy = { tag: { label: "Apply tag", loading: "Adding..." } } as const;

type BulkActionModalProps = Pick<
  KeywordWorkspaceActions,
  "bulkSetTargetAction" | "bulkTagAction"
> & {
  actionError: string | null;
  mode: BulkMode;
  onClose: () => void;
  onDone: () => void;
  onError: (message: string | null) => void;
  onRequestClearTarget: () => void;
  projectId: string;
  selectedRows: KeywordRow[];
};

export function BulkActionModal({
  actionError,
  bulkSetTargetAction,
  bulkTagAction,
  mode,
  onClose,
  onDone,
  onError,
  onRequestClearTarget,
  projectId,
  selectedRows,
}: Readonly<BulkActionModalProps>) {
  const [busy, setBusy] = useState(false);
  const selectedIds = selectedRows.map((row) => row.id);
  const targetView = bulkTargetView(selectedRows);
  const title = mode === "target" ? targetView.modalTitle : mode && staticTitles[mode];
  const submitLabel =
    mode === "target" ? targetView.submitLabel : mode ? submitCopy[mode].label : "";
  const loadingLabel =
    mode === "target" ? "Saving..." : mode ? submitCopy[mode].loading : undefined;

  function handleClose() {
    setBusy(false);
    onClose();
  }

  function submitForm() {
    const form = document.getElementById(BULK_KEYWORD_FORM_ID);
    if (form instanceof HTMLFormElement) form.requestSubmit();
  }

  const formChrome = {
    formId: BULK_KEYWORD_FORM_ID,
    hideSubmit: true as const,
    onBusyChange: setBusy,
  };

  return (
    <Modal
      footer={
        mode ? (
          <>
            <Button disabled={busy} onClick={handleClose} type="button" variant="ghost">
              Cancel
            </Button>
            <Button
              form={BULK_KEYWORD_FORM_ID}
              loading={busy}
              loadingLabel={loadingLabel}
              type="submit"
            >
              {submitLabel}
            </Button>
          </>
        ) : null
      }
      headerDivider
      onClose={handleClose}
      onPrimaryAction={submitForm}
      open={mode !== null}
      primaryActionDisabled={busy}
      size="sm"
      title={title || undefined}
    >
      <div className="grid gap-3">
        <p className="m-0 font-sans tabular-nums text-[11.5px] text-fg-muted">
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
            {...formChrome}
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
            {...formChrome}
          />
        ) : null}
        {actionError ? (
          <p className="m-0 font-sans tabular-nums text-[11.5px] text-red-text">{actionError}</p>
        ) : null}
      </div>
    </Modal>
  );
}
