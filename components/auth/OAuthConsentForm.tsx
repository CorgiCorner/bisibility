"use client";

import { authClient } from "@/lib/auth/client";
import {
  defaultOAuthAccessLevel,
  type OAuthAccessLevel,
  oauthApiTokenChoiceRequested,
  oauthConsentChoiceSchema,
  oauthConsentScopes,
  offeredOAuthAccessLevels,
  selectOAuthConsentScopes,
} from "@/lib/auth/oauth-consent-copy";
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

const consentSchema = oauthConsentChoiceSchema.extend({ accept: z.boolean() });
type ConsentValues = z.infer<typeof consentSchema>;
type ConsentRequest = Parameters<typeof authClient.oauth2.consent>[0];

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
  const ceiling = oauthConsentScopes(client, scopes);
  const offered = offeredOAuthAccessLevels(ceiling);
  const [pendingChoice, setPendingChoice] = useState<"accept" | "deny" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ConsentValues>({
    defaultValues: {
      accept: true,
      accessLevel: defaultOAuthAccessLevel(ceiling),
      allowApiTokens: false,
    },
    resolver: zodResolver(consentSchema),
  });
  const watchedLevel = form.watch("accessLevel");
  const level: OAuthAccessLevel | null =
    watchedLevel && offered.includes(watchedLevel)
      ? watchedLevel
      : defaultOAuthAccessLevel(ceiling);
  const allowApiTokens = oauthApiTokenChoiceRequested(ceiling) && form.watch("allowApiTokens");
  const grantedScopes = client.dynamic
    ? selectOAuthConsentScopes(ceiling, { accessLevel: level, allowApiTokens })
    : ceiling;

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
        ...(values.accept
          ? {
              ...(client.dynamic ? { access_level: level, allow_api_tokens: allowApiTokens } : {}),
              scope: grantedScopes.join(" "),
            }
          : {}),
      } as ConsentRequest);
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
        allowApiTokens={allowApiTokens}
        ceiling={ceiling}
        client={client}
        disabled={!client.id || pendingChoice !== null}
        error={formError}
        level={level}
        onAllowApiTokens={(value) => form.setValue("allowApiTokens", value)}
        onChoose={choose}
        onLevel={(value) => form.setValue("accessLevel", value)}
        pendingChoice={pendingChoice}
        scopes={grantedScopes}
        secondsLeft={secondsLeft}
      />
    </div>
  );
}
