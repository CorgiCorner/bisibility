"use client";

import { keywordLines } from "@/components/onboarding/onboarding-form-utils";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useEffect, useMemo, useState } from "react";
import type { FirstCheckRunActions } from "./use-first-check-run";

type FirstCheckKeywordInput = {
  keywordDraft?: string;
  listFirstCheckCandidatesAction?: FirstCheckRunActions["listFirstCheckCandidatesAction"];
  projectId: string | null;
  providerReady: boolean;
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
  keywordDraft,
  listFirstCheckCandidatesAction,
  projectId,
  providerReady,
}: FirstCheckKeywordInput) {
  const draftOptions = useMemo(() => uniqueKeywordOptions(keywordDraft), [keywordDraft]);
  const [resumedOptions, setResumedOptions] = useState<{ label: string; value: string }[]>([]);
  const [keywordError, setKeywordError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const loadRequest = useMemo(
    () => ({ attempt: retryAttempt, projectId }),
    [projectId, retryAttempt],
  );
  const options = draftOptions.length > 0 ? draftOptions : resumedOptions;
  const [selected, setSelected] = useState(draftOptions[0]?.value ?? "");

  useEffect(() => {
    if (selected || draftOptions.length > 0) return;
    if (!loadRequest.projectId || !providerReady || !listFirstCheckCandidatesAction) return;
    let cancelled = false;
    void listFirstCheckCandidatesAction({ limit: 1, projectId: loadRequest.projectId })
      .then(({ candidates }) => {
        const keyword = candidates[0]?.text;
        if (cancelled || !keyword) return;
        setKeywordError(null);
        setResumedOptions([{ label: keyword, value: keyword }]);
        setSelected(keyword);
      })
      .catch((error) => {
        if (!cancelled) {
          setKeywordError(
            actionErrorMessage(error, "The sample keyword could not be loaded. Try again."),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [draftOptions.length, listFirstCheckCandidatesAction, loadRequest, providerReady, selected]);

  function retryKeyword() {
    setKeywordError(null);
    setRetryAttempt((current) => current + 1);
  }

  return {
    keywordError,
    keywordOptions: options,
    retryKeyword,
    sampleKeyword: selected,
    setSampleKeyword: setSelected,
  };
}
