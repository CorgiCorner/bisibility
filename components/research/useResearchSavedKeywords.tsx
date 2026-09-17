"use client";

import { useToast } from "@/components/ui/toast-context";
import type { removeSavedKeywords, saveKeywords } from "@/lib/actions/saved-keyword";
import { rankTrackerTabPath } from "@/lib/routing/app-path";
import { actionErrorMessage } from "@/lib/ui/action-error";
import Link from "next/link";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("projectResearch.saved");
  const label = alreadySaved ? t("alreadySaved", { count }) : t("savedCount", { count });
  return (
    <>
      {label} /{" "}
      <Link
        className="font-semibold hover:underline"
        href={rankTrackerTabPath(projectRef, "saved")}
      >
        {t("viewSaved")}
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
            severity: "info",
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
          severity: "success",
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
      showToast(actionErrorMessage(error), { severity: "error" });
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
      showToast(actionErrorMessage(error), { severity: "error" });
    }
  }

  return { remove, save };
}
