import type { ProviderErrorCode } from "@/lib/providers/provider-error-code";
import { isProviderErrorCode } from "@/lib/providers/provider-error-code";

export type ProviderFailurePresentation = {
  code: ProviderErrorCode | null;
  message: string;
  showOpenIntegrations: boolean;
  showRetry: boolean;
};

const PRESENTATIONS: Record<ProviderErrorCode, Omit<ProviderFailurePresentation, "code">> = {
  provider_billing: {
    message:
      "The rank check could not run because the provider account has insufficient funds. Add funds or connect a different provider, then try again.",
    showOpenIntegrations: true,
    showRetry: true,
  },
  provider_account_restricted: {
    message:
      "The provider has restricted access to this account. Review the account in the provider dashboard or contact their support, then try again.",
    showOpenIntegrations: true,
    showRetry: false,
  },
  provider_auth: {
    message:
      "The rank check could not run because the provider credentials were rejected. Reconnect the provider, then try again.",
    showOpenIntegrations: true,
    showRetry: false,
  },
  provider_rate_limited: {
    message:
      "The rank check could not run because the provider is temporarily rate limited. Try again in a few minutes.",
    showOpenIntegrations: false,
    showRetry: true,
  },
  provider_transient: {
    message:
      "The rank check could not run because the provider is temporarily unavailable. Try again in a few minutes.",
    showOpenIntegrations: false,
    showRetry: true,
  },
};

const FALLBACK: Omit<ProviderFailurePresentation, "code"> = {
  message:
    "The rank check could not run because of a provider error. Try again, or view check details for more information.",
  showOpenIntegrations: false,
  showRetry: true,
};

export function providerFailurePresentation(
  code: unknown,
  error?: string | null,
): ProviderFailurePresentation {
  // Older checks incorrectly stored account restrictions as billing failures.
  if (
    code === "provider_billing" &&
    /unusual activity|temporarily paused access/i.test(error ?? "")
  ) {
    return { code: "provider_account_restricted", ...PRESENTATIONS.provider_account_restricted };
  }
  if (!isProviderErrorCode(code)) return { code: null, ...FALLBACK };
  return { code, ...PRESENTATIONS[code] };
}

export type RankCheckNeutralFailureCode = "rank_check_deferred";

export function neutralRankCheckFailurePresentation(code: RankCheckNeutralFailureCode) {
  return {
    code,
    message:
      "The rank check was deferred and did not complete. View check details for more information, then try again when the blocking condition is resolved.",
    showOpenIntegrations: false,
    showRetry: true,
  };
}
