"use client";

import type { KeywordWorkspaceActions } from "@/components/keywords/action-utils";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { KeywordRow } from "@/lib/queries/keywords";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { BulkTagForm } from "./BulkActionForms";
import { BulkTargetForm } from "./BulkTargetForm";
import { bulkTargetView } from "./bulk-target-model";

export type BulkMode = "tag" | "target" | null;

const BULK_KEYWORD_FORM_ID = "bulk-keyword-action";

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
  const t = useTranslations("projectRankTracker.keywordImport.management.bulk");
  const [busy, setBusy] = useState(false);
  const selectedIds = selectedRows.map((row) => row.id);
  const targetView = bulkTargetView(selectedRows);
  const title = mode === "target" ? t(targetView.titleKey) : mode ? t("addTag") : null;
  const submitLabel = mode === "target" ? t(targetView.submitKey) : mode ? t("applyTag") : "";
  const loadingLabel = mode === "target" ? t("saving") : mode ? t("adding") : undefined;

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
              {t("cancel")}
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
          {t("appliesTo", { count: selectedRows.length })}
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
