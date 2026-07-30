"use client";

import { useToast } from "@/components/ui";
import type { removeSavedKeywords, saveKeywords } from "@/lib/actions/saved-keyword";
import { appPath } from "@/lib/routing/app-path";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { BookmarkSimpleIcon as BookmarkSimple } from "@phosphor-icons/react";
import Link from "next/link";
import {
  type ResearchSaveDraft,
  researchKeywordIdentity,
  researchSaveInput,
} from "./research-workspace-model";

type UseResearchSavedKeywordsInput = {
  canRemove: boolean;
  markSaved: (keywords: string[], alreadySaved: boolean) => void;
  projectId: string;
  removeSavedKeywordsAction: typeof removeSavedKeywords;
  saveKeywordsAction: typeof saveKeywords;
};

function SavedToastMessage({
  alreadySaved,
  count,
  projectRef,
}: Readonly<{ alreadySaved: boolean; count: number; projectRef: string }>) {
  const label = alreadySaved
    ? count === 1
      ? "Keyword already saved"
      : `${count} keywords already saved`
    : `Saved ${count} ${count === 1 ? "keyword" : "keywords"}`;
  return (
    <>
      {label} /{" "}
      <Link
        className="font-semibold hover:underline"
        href={appPath(projectRef, "keywords?tab=saved")}
      >
        View in Keywords / Saved
      </Link>
    </>
  );
}

export function useResearchSavedKeywords({
  canRemove,
  markSaved,
  projectId,
  removeSavedKeywordsAction,
  saveKeywordsAction,
}: UseResearchSavedKeywordsInput) {
  const { showToast } = useToast();

  async function save(draft: ResearchSaveDraft) {
    try {
      const outcome = await saveKeywordsAction(researchSaveInput(projectId, draft));
      const requestedKeywords = draft.rows.map((row) => row.keyword);
      markSaved(requestedKeywords, true);
      if (outcome.savedCount === 0) {
        showToast(
          <SavedToastMessage
            alreadySaved
            count={outcome.duplicateCount || draft.rows.length}
            projectRef={projectId}
          />,
          {
            icon: <BookmarkSimple aria-hidden size={18} weight="fill" />,
            tint: "accent",
          },
        );
        return;
      }
      const createdIdentities = new Set(
        outcome.created.map((row) => researchKeywordIdentity(row.keyword)),
      );
      const createdKeywords = draft.rows
        .filter((row) => createdIdentities.has(researchKeywordIdentity(row.keyword)))
        .map((row) => row.keyword);
      showToast(
        <SavedToastMessage
          alreadySaved={false}
          count={outcome.savedCount}
          projectRef={projectId}
        />,
        {
          icon: <BookmarkSimple aria-hidden size={18} weight="fill" />,
          tint: "accent",
          ...(canRemove
            ? {
                undo: async () => {
                  await removeSavedKeywordsAction({
                    projectId,
                    publicIds: outcome.created.map((row) => row.publicId),
                  });
                  markSaved(createdKeywords, false);
                },
              }
            : {}),
        },
      );
    } catch (error) {
      showToast(actionErrorMessage(error), { tint: "red" });
    }
  }

  async function remove(draft: ResearchSaveDraft) {
    if (!canRemove) return;
    try {
      await removeSavedKeywordsAction({
        projectId,
        rows: draft.rows.map((row) => ({ keyword: row.keyword, location: draft.location })),
      });
      markSaved(
        draft.rows.map((row) => row.keyword),
        false,
      );
    } catch (error) {
      showToast(actionErrorMessage(error), { tint: "red" });
    }
  }

  return { remove, save };
}
