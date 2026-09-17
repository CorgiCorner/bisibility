"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { appPath, appRootPath } from "@/lib/routing/app-path";
import { presentActionError } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type SyntheticEvent, useRef, useState } from "react";
import type { SaveOnboardingMarketsAction } from "./onboarding-market-actions";

type FirstCheckSubmitInput = {
  completeOnboardingAction?: (input: { projectId: string }) => Promise<unknown>;
  marketKeys: readonly string[];
  navigationProjectId: string | null | undefined;
  saveMarketsAction?: SaveOnboardingMarketsAction;
};

export function useFirstCheckSubmit({
  completeOnboardingAction,
  marketKeys,
  navigationProjectId,
  saveMarketsAction,
}: FirstCheckSubmitInput) {
  const t = useTranslations("onboarding.firstCheck");
  const sharedErrors = useSharedErrorMessages();
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  async function complete() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (navigationProjectId && saveMarketsAction) {
        await saveMarketsAction({ marketKeys: [...marketKeys], projectId: navigationProjectId });
      }
      if (navigationProjectId && completeOnboardingAction) {
        await completeOnboardingAction({ projectId: navigationProjectId });
      }
      router.push(
        navigationProjectId ? appPath(navigationProjectId, "getting-started") : appRootPath(),
      );
    } catch (error) {
      setSubmitError(presentActionError(error, sharedErrors, t("errors.complete")));
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    void complete();
  }

  return { complete, onSubmit, submitError, submitting };
}
