"use client";
import {
  ScheduleReviewCancelled,
  useScheduleSpendReview,
} from "@/components/schedules/useScheduleSpendReview";
import { capacityActionClient } from "@/lib/capacity/action";
import { keywordCreateChange } from "@/lib/schedules/keyword-create-change";

const addKeywordsMatrix = capacityActionClient(addKeywordsMatrixCapacityAction);

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import type { ExistingKeyword } from "@/components/keywords/AddKeywordCsvReviewModel";
import { hasActionWarning } from "@/components/keywords/action-utils";
import type { LocationFieldValue } from "@/components/keywords/LocationField";
import { presentSafeActionError } from "@/components/keywords/safe-action-error";
import { addKeywordsMatrix as addKeywordsMatrixCapacityAction } from "@/lib/actions/keyword";
import type { AddKeywordDrawerForm, AddKeywordTab } from "@/lib/keywords/add-keyword-drawer-shared";
import type { SerpDevice } from "@/lib/serp/constants";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import type { DrawerCsvKeywordRow } from "./AddKeywordCsvRows";
import { type AddKeywordDrawerProps, addedKeywordResult } from "./AddKeywordDrawerExtensions";
import { addKeywordDrawerInput } from "./AddKeywordDrawerSubmit";

type UseAddKeywordDrawerSaveArgs = Pick<
  AddKeywordDrawerProps,
  "addKeywordsAction" | "consumeSavedIds" | "onAdded"
> & {
  projectId: string;
  activeTab: AddKeywordTab;
  checkScheduleId?: string | null;
  csvRows?: DrawerCsvKeywordRow[];
  csvText: string;
  devices: SerpDevice[];
  existingKeywords: readonly ExistingKeyword[];
  locationKeys: string[];
  locationValue: LocationFieldValue;
  onClose: () => void;
  setActionError: (value: string | null) => void;
  setActionWarning: (value: string | null) => void;
};

export function useAddKeywordDrawerSave({
  projectId,
  activeTab,
  addKeywordsAction,
  checkScheduleId,
  consumeSavedIds,
  csvRows,
  csvText,
  devices,
  existingKeywords,
  locationKeys,
  locationValue,
  onAdded,
  onClose,
  setActionError,
  setActionWarning,
}: UseAddKeywordDrawerSaveArgs) {
  const review = useScheduleSpendReview(projectId);
  const router = useRouter();
  const sharedErrors = useSharedErrorMessages();
  const t = useTranslations("projectRankTracker.keywordImport.management.add");
  const save = useCallback(
    async (values: AddKeywordDrawerForm) => {
      setActionError(null);
      setActionWarning(null);
      const pending = addKeywordDrawerInput({
        activeTab,
        checkScheduleId,
        csvRows,
        csvText,
        devices,
        existingKeywords,
        locationKeys,
        locationValue,
        values,
      });
      if ("warning" in pending) return setActionWarning(t(pending.warning));
      try {
        const input = consumeSavedIds?.length
          ? { ...pending.input, consumeSavedIds: [...consumeSavedIds] }
          : pending.input;
        const result = await review.run(keywordCreateChange(input), (submission) =>
          activeTab === "manual"
            ? addKeywordsMatrix({ ...input, review: submission })
            : capacityActionClient(addKeywordsAction)({ ...input, review: submission }),
        );
        const addedKeywords = addedKeywordResult(result);
        if (hasActionWarning(result)) {
          setActionWarning(t("locationDegraded"));
          onAdded?.(addedKeywords, { locationKeys });
          router.refresh();
          return;
        }
        onAdded?.(addedKeywords, { locationKeys });
        onClose();
        router.refresh();
      } catch (error) {
        if (error instanceof ScheduleReviewCancelled) return;
        setActionError(presentSafeActionError(error, sharedErrors, t("addFailed")));
      }
    },
    [
      activeTab,
      addKeywordsAction,
      checkScheduleId,
      consumeSavedIds,
      csvRows,
      csvText,
      devices,
      existingKeywords,
      locationKeys,
      locationValue,
      onAdded,
      onClose,
      router,
      review.run,
      setActionError,
      setActionWarning,
      sharedErrors,
      t,
    ],
  );
  return { save, dialog: review.dialog, isActive: review.isActive };
}
