"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { classifyActionError } from "@/lib/ui/action-error";
import { useTranslations } from "next-intl";

/** Keeps safe digest and stale-deployment recovery while classifying feature-owned failures. */
export function useDeveloperActionError() {
  const sharedErrors = useSharedErrorMessages();
  const apiKeyErrors = useTranslations("projectSettingsDevelopers.apiKeys.errors");
  const webhookErrors = useTranslations("projectSettingsDevelopers.webhooks.errors");

  function knownApiKeyError(message: string) {
    return message === "API key not found." ? apiKeyErrors("notFound") : null;
  }

  function knownWebhookError(message: string) {
    if (message === "Deploy webhook not found.") return webhookErrors("notFound");
    if (message === "Deploy webhook is already disabled.") return webhookErrors("alreadyDisabled");
    if (message === "Disabled deploy webhooks cannot be rotated.") {
      return webhookErrors("disabledCannotRotate");
    }
    if (message === "Disabled deploy webhooks cannot send test events.") {
      return webhookErrors("disabledCannotTest");
    }
    if (message === "Deploy webhook test event could not be created.") {
      return webhookErrors("testNotCreated");
    }
    return null;
  }

  function present(error: unknown, fallback: string, known: (message: string) => string | null) {
    const classified = classifyActionError(error);
    if (classified.kind === "staleDeployment") return sharedErrors.staleDeployment();
    if (classified.kind === "serverComponentDigest") {
      return sharedErrors.serverComponentDigest({ digest: classified.digest });
    }
    if (classified.kind === "ownedMessage") return known(classified.message) ?? fallback;
    return fallback;
  }

  return {
    apiKey: (error: unknown, fallback: string) => present(error, fallback, knownApiKeyError),
    webhook: (error: unknown, fallback: string) => present(error, fallback, knownWebhookError),
  };
}
