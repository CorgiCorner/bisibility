"use client";

import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import { TrashIcon as Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { KeywordWorkspaceActions } from "./action-utils";
import { useKeywordDeletion } from "./use-keyword-deletion";

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
  const router = useRouter();
  const deletion = useKeywordDeletion({
    action: bulkDeleteAction,
    projectId,
    onDeleted: () => {
      router.push(appPath(projectRef, "rank-tracker"));
      router.refresh();
    },
  });

  return (
    <span className="grid gap-2">
      <button
        aria-label={t("deleteAria", { name: keywordLabel })}
        className="inline-flex flex-none items-center justify-center gap-[7px] rounded-control border border-red px-4 py-2.5 text-[13px] font-semibold text-red-text outline-none hover:bg-bg-sunken focus-visible:bg-bg-sunken disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted"
        disabled={deletion.busy}
        onClick={() => void deletion.open([keywordId])}
        type="button"
      >
        <Trash aria-hidden size={14} weight="regular" />
        {t("delete")}
      </button>
      {deletion.modal}
    </span>
  );
}
