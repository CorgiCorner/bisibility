"use client";

import { actionErrorMessage } from "@/components/onboarding/onboarding-form-utils";
import { appPath, appRootPath } from "@/lib/routing/app-path";
import { useRouter } from "next/navigation";
import { type SyntheticEvent, useRef, useState } from "react";
import type { SaveOnboardingMarketsAction } from "./OnboardingMarkets";

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
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
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
      router.push(navigationProjectId ? appPath(navigationProjectId, "dashboard") : appRootPath());
    } catch (error) {
      setSubmitError(actionErrorMessage(error, "Onboarding could not be completed. Try again."));
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return { onSubmit, submitError, submitting };
}
