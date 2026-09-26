"use client";

import { authClient } from "@/lib/auth/client";
import { oauthConsentScopes } from "@/lib/auth/oauth-consent-copy";
import type { OAuthConsentClient } from "@/lib/auth/oauth-consent-types";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { OAuthConsentAccountBar } from "./OAuthConsentAccountBar";
import { OAuthConsentExpired } from "./OAuthConsentExpired";
import { OAuthConsentRequest } from "./OAuthConsentRequest";
import { useOAuthConsentCountdown } from "./useOAuthConsentCountdown";

const consentSchema = z.object({ accept: z.boolean() });
type ConsentValues = z.infer<typeof consentSchema>;

export type OAuthConsentFormProps = {
  account: { avatarUrl?: string | null; email: string; initials: string };
  client: OAuthConsentClient;
  expiresAt: number;
  scopes: string[];
};

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  if (error && typeof error === "object" && "error_description" in error) {
    const description = (error as { error_description?: unknown }).error_description;
    if (typeof description === "string") return description;
  }
  return fallback;
}

function isSafeRedirect(target: string) {
  if (target.startsWith("/") && !target.startsWith("//")) return true;
  try {
    const url = new URL(target, window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function OAuthConsentForm({
  account,
  client,
  expiresAt,
  scopes,
}: Readonly<OAuthConsentFormProps>) {
  const t = useTranslations("auth.oauthConsent");
  const secondsLeft = useOAuthConsentCountdown(expiresAt);
  const grantedScopes = oauthConsentScopes(client, scopes);
  const [pendingChoice, setPendingChoice] = useState<"accept" | "deny" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ConsentValues>({
    defaultValues: { accept: true },
    resolver: zodResolver(consentSchema),
  });

  async function submitConsent(values: ConsentValues) {
    setFormError(null);
    if (values.accept && grantedScopes.length === 0) {
      setFormError(t("consentNoScopes"));
      setPendingChoice(null);
      return;
    }
    try {
      const response = await authClient.oauth2.consent({
        accept: values.accept,
        ...(values.accept ? { scope: grantedScopes.join(" ") } : {}),
      });
      if (response.error) return setFormError(errorMessage(response.error, t("consentError")));
      const redirectUrl = response.data?.url;
      if (typeof redirectUrl !== "string" || !redirectUrl) {
        return setFormError(t("consentMissingRedirect"));
      }
      if (!isSafeRedirect(redirectUrl)) {
        return setFormError(t("consentUnsupportedRedirect"));
      }
      window.location.assign(redirectUrl);
    } catch (error) {
      setFormError(errorMessage(error, t("consentError")));
    } finally {
      setPendingChoice(null);
    }
  }

  function choose(accept: boolean) {
    setPendingChoice(accept ? "accept" : "deny");
    form.setValue("accept", accept, { shouldValidate: true });
    void form.handleSubmit(submitConsent)();
  }

  if (secondsLeft <= 0) return <OAuthConsentExpired client={client} />;

  return (
    <div className="w-full max-w-[520px]">
      <OAuthConsentAccountBar
        avatarUrl={account.avatarUrl}
        email={account.email}
        initials={account.initials}
      />
      <OAuthConsentRequest
        client={client}
        disabled={!client.id || pendingChoice !== null}
        error={formError}
        onChoose={choose}
        pendingChoice={pendingChoice}
        scopes={grantedScopes}
        secondsLeft={secondsLeft}
      />
    </div>
  );
}
