"use client";

import { keywordLines } from "@/components/onboarding/onboarding-form-utils";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useMemo, useState } from "react";
import type { FirstCheckRunActions } from "./use-first-check-run";

type Input = {
  initialKeywordText?: string | null;
  keywordDraft?: string;
  listFirstCheckCandidatesAction?: FirstCheckRunActions["listFirstCheckCandidatesAction"];
  projectId: string | null;
};
function uniqueKeywordOptions(keywordDraft: string | undefined) {
  const seen = new Set<string>();
  return keywordLines(keywordDraft ?? "").flatMap((keyword) => {
    const key = keyword.toLocaleLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ label: keyword, value: keyword }];
  });
}
export function useFirstCheckKeyword({
  initialKeywordText,
  keywordDraft,
  listFirstCheckCandidatesAction,
  projectId,
}: Input) {
  const draftOptions = useMemo(() => uniqueKeywordOptions(keywordDraft), [keywordDraft]);
  const initialOptions = draftOptions.length
    ? draftOptions
    : initialKeywordText
      ? [{ label: initialKeywordText, value: initialKeywordText }]
      : [];
  const [resumedOptions, setResumedOptions] = useState<{ label: string; value: string }[]>([]);
  const [keywordError, setKeywordError] = useState<string | null>(null);
  const options = resumedOptions.length ? resumedOptions : initialOptions;
  const [selected, setSelected] = useState(initialOptions[0]?.value ?? "");
  async function retryKeyword() {
    setKeywordError(null);
    if (!projectId || !listFirstCheckCandidatesAction) return;
    try {
      const { candidates } = await listFirstCheckCandidatesAction({ limit: 1, projectId });
      const keyword = candidates[0]?.text;
      if (!keyword) throw new Error("No saved keyword is available.");
      setResumedOptions([{ label: keyword, value: keyword }]);
      setSelected(keyword);
    } catch (error) {
      setKeywordError(
        actionErrorMessage(error, "The sample keyword could not be loaded. Try again."),
      );
    }
  }
  return {
    keywordError,
    keywordOptions: options,
    retryKeyword,
    sampleKeyword: selected,
    setSampleKeyword: setSelected,
  };
}
