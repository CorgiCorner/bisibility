"use client";

import { ConfirmModal } from "@/components/ui";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import { TrashIcon as Trash } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { actionErrorMessage, type KeywordWorkspaceActions } from "./action-utils";

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
      setActionError(actionErrorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <span className="grid gap-2">
      <button
        aria-label={`Delete ${keywordLabel}`}
        className="inline-flex flex-none items-center justify-center gap-[7px] rounded-[10px] border border-red px-4 py-2.5 text-[13px] font-semibold text-red-text outline-none hover:bg-bg-sunken focus-visible:bg-bg-sunken disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted"
        disabled={deleting}
        onClick={() => setConfirmOpen(true)}
        type="button"
      >
        <Trash aria-hidden size={14} weight="bold" />
        Delete
      </button>
      <ConfirmModal
        busy={deleting}
        kind="deleteKeyword"
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void handleDelete()}
        open={confirmOpen}
      />
      {actionError ? (
        <span className="font-mono text-[11px] text-red-text">{actionError}</span>
      ) : null}
    </span>
  );
}
