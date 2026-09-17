import type { SharedErrorMessages } from "@/lib/ui/action-error";
import { classifyActionError, presentActionError } from "@/lib/ui/action-error";
import type { useTranslations } from "next-intl";
import type { OnboardingSerpProviderId } from "./StepConnectProvider.fields";

export function providerLabel(
  t: ReturnType<typeof useTranslations<"onboarding.provider">>,
  providerId: OnboardingSerpProviderId,
) {
  return providerId === "dataforseo" ? t("cards.dataforseo.label") : t("cards.serpapi.label");
}

export function providerActionError(
  error: unknown,
  sharedErrors: SharedErrorMessages,
  fallback: string,
) {
  const classified = classifyActionError(error);
  if (classified.kind === "staleDeployment" || classified.kind === "serverComponentDigest") {
    return presentActionError(error, sharedErrors, fallback);
  }
  return fallback;
}
