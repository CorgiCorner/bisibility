"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import { TrashIcon as Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { KeywordWorkspaceActions } from "./action-utils";
import { presentSafeActionError } from "./safe-action-error";

type KeywordPendingDeleteButtonProps = {
  bulkDeleteAction: KeywordWorkspaceActions["bulkDeleteAction"];
  keywordId: string;
  keywordLabel: string;
  projectId: string;
  projectRef: ProjectRef;
};

export function KeywordPendingDeleteButton({
  bulkDeleteAction,
  keywordId,
  keywordLabel,
  projectId,
  projectRef,
}: Readonly<KeywordPendingDeleteButtonProps>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.rowActions");
  const sharedErrors = useSharedErrorMessages();
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setActionError(null);
    setDeleting(true);
    try {
      await bulkDeleteAction({ keywordIds: [keywordId], projectId });
      setConfirmOpen(false);
      router.push(appPath(projectRef, "rank-tracker"));
      router.refresh();
    } catch (error) {
      setActionError(presentSafeActionError(error, sharedErrors, t("deleteFailed")));
      throw error;
    } finally {
      setDeleting(false);
    }
  }

  return (
    <span className="grid gap-2">
      <button
        aria-label={t("deleteAria", { name: keywordLabel })}
        className="inline-flex flex-none items-center justify-center gap-[7px] rounded-control border border-red px-4 py-2.5 text-[13px] font-semibold text-red-text outline-none hover:bg-bg-sunken focus-visible:bg-bg-sunken disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted"
        disabled={deleting}
        onClick={() => setConfirmOpen(true)}
        type="button"
      >
        <Trash aria-hidden size={14} weight="regular" />
        {t("delete")}
      </button>
      <ConfirmModal
        busy={deleting}
        kind="deleteKeyword"
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        open={confirmOpen}
      />
      {actionError ? (
        <span className="font-sans tabular-nums text-[11px] text-red-text">{actionError}</span>
      ) : null}
    </span>
  );
}
