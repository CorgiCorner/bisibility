"use client";

import type { ExistingKeyword } from "@/components/keywords/AddKeywordCsvReviewModel";
import { actionErrorMessage, actionWarningMessage } from "@/components/keywords/action-utils";
import type { LocationFieldValue } from "@/components/keywords/LocationField";
import { addKeywordsMatrix } from "@/lib/actions/keyword";
import type { AddKeywordDrawerForm, AddKeywordTab } from "@/lib/keywords/add-keyword-drawer-shared";
import type { SerpDevice } from "@/lib/serp/markets";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { type AddKeywordDrawerProps, addedKeywordResult } from "./AddKeywordDrawerExtensions";
import { addKeywordDrawerInput } from "./AddKeywordDrawerSubmit";

type UseAddKeywordDrawerSaveArgs = Pick<
  AddKeywordDrawerProps,
  "addKeywordsAction" | "consumeSavedIds" | "onAdded"
> & {
  activeTab: AddKeywordTab;
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
  activeTab,
  addKeywordsAction,
  consumeSavedIds,
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
  const router = useRouter();
  return useCallback(
    async (values: AddKeywordDrawerForm) => {
      setActionError(null);
      setActionWarning(null);
      const pending = addKeywordDrawerInput({
        activeTab,
        csvText,
        devices,
        existingKeywords,
        locationKeys,
        locationValue,
        values,
      });
      if ("warning" in pending) return setActionWarning(pending.warning);
      try {
        const input = consumeSavedIds?.length
          ? { ...pending.input, consumeSavedIds: [...consumeSavedIds] }
          : pending.input;
        const result =
          activeTab === "manual" ? await addKeywordsMatrix(input) : await addKeywordsAction(input);
        const addedKeywords = addedKeywordResult(result);
        const warning = actionWarningMessage(result);
        if (warning) {
          setActionWarning(warning);
          onAdded?.(addedKeywords, { locationKeys });
          router.refresh();
          return;
        }
        onAdded?.(addedKeywords, { locationKeys });
        onClose();
        router.refresh();
      } catch (error) {
        setActionError(actionErrorMessage(error));
      }
    },
    [
      activeTab,
      addKeywordsAction,
      consumeSavedIds,
      csvText,
      devices,
      existingKeywords,
      locationKeys,
      locationValue,
      onAdded,
      onClose,
      router,
      setActionError,
      setActionWarning,
    ],
  );
}
