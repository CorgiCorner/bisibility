import "server-only";

import { googleOAuthErrorCopy } from "@/lib/integrations/google-oauth-copy";
import type { GoogleOAuthSetup } from "@/lib/integrations/types";
import { getPendingGoogleOAuthSetup } from "@/lib/providers/analytics/google-oauth-pending";

export type SearchInsightsOauthParams = {
  google?: string;
  provider?: string;
  reason?: string;
};

export type SearchInsightsOauthReturn = {
  error: string | null;
  provider: "ga4" | "gsc" | null;
  setup: GoogleOAuthSetup | null;
};

const NONE: SearchInsightsOauthReturn = { error: null, provider: null, setup: null };

const FALLBACK_ERROR =
  "Google connection wasn't completed. Try again and choose the account that has access to the property.";

function isOauthAnalyticsProvider(value: string | undefined): value is "ga4" | "gsc" {
  return value === "ga4" || value === "gsc";
}

/**
 * The consent screen returns to whichever page started it, so the module has to finish its own
 * connection rather than sending the customer to Integrations to choose the property.
 */
export async function resolveSearchInsightsOauthReturn(
  projectRef: string,
  params: SearchInsightsOauthParams,
): Promise<SearchInsightsOauthReturn> {
  if (!isOauthAnalyticsProvider(params.provider)) return NONE;
  if (params.google === "select") {
    return {
      error: null,
      provider: params.provider,
      setup: await getPendingGoogleOAuthSetup(projectRef),
    };
  }
  if (params.google === "error") {
    return {
      error: googleOAuthErrorCopy(params.reason, FALLBACK_ERROR),
      provider: params.provider,
      setup: null,
    };
  }
  return NONE;
}
