"use client";

import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { previewKeywordDeletion } from "@/lib/actions/keyword-delete-impact";
import type { KeywordDeleteImpact } from "@/lib/keywords/delete-impact";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import type { KeywordWorkspaceActions } from "./action-utils";
import { KeywordDeleteImpact as ImpactDetails } from "./KeywordDeleteImpact";

type Selection = { ids: string[]; impact?: KeywordDeleteImpact; failed?: boolean };
export function useKeywordDeletion({
  action,
  onDeleted,
  projectId,
}: {
  action: KeywordWorkspaceActions["bulkDeleteAction"];
  onDeleted: () => void;
  projectId: string;
}) {
  const t = useTranslations("projectRankTracker.deletion");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const confirming = useRef(false);
  function close() {
    if (confirming.current) return;
    request.current += 1;
    setSelection(null);
  }
  async function open(ids: string[]) {
    if (confirming.current) return;
    const version = ++request.current;
    setSelection({ ids });
    try {
      const impact = await previewKeywordDeletion({ keywordIds: ids, projectId });
      if (version === request.current) setSelection({ ids, impact });
    } catch {
      if (version === request.current) setSelection({ ids, failed: true });
    }
  }
  async function confirm() {
    if (
      !selection?.impact ||
      selection.impact.targetCount === 0 ||
      selection.impact.runningTargetCount > 0 ||
      confirming.current
    )
      return;
    confirming.current = true;
    setBusy(true);
    try {
      await action({ keywordIds: selection.ids, projectId });
      request.current += 1;
      setSelection(null);
      onDeleted();
    } finally {
      confirming.current = false;
      setBusy(false);
    }
  }
  const modal = (
    <ConfirmModal
      size="lg"
      busy={busy}
      confirmationDisabled={
        !selection?.impact?.targetCount || Boolean(selection.impact.runningTargetCount)
      }
      kind={selection?.ids.length === 1 ? "deleteKeyword" : "deleteBulk"}
      open={selection !== null}
      onClose={close}
      onConfirm={confirm}
    >
      {selection?.impact ? (
        <>
          <ImpactDetails impact={selection.impact} projectId={projectId} />
          {selection.impact.runningTargetCount > 0 ? (
            <Button
              className="mt-3"
              onClick={() => void open(selection.ids)}
              size="sm"
              variant="secondary"
            >
              {t("refresh")}
            </Button>
          ) : null}
        </>
      ) : (
        <div
          className="mt-4 text-[12px] leading-5 text-fg-muted"
          role={selection?.failed ? "alert" : "status"}
        >
          {selection?.failed ? (
            <>
              {t("loadFailed")}{" "}
              <Button onClick={() => void open(selection.ids)} size="sm" variant="secondary">
                {t("retry")}
              </Button>
            </>
          ) : (
            t("loading")
          )}
        </div>
      )}
    </ConfirmModal>
  );
  return { busy, modal, open };
}
