import type { ProviderErrorCode } from "@/lib/providers/provider-error-code";
import { isProviderErrorCode } from "@/lib/providers/provider-error-code";

const RANK_CHECK_ONLY_FAILURE_CODES = [
  "provider_unresolved_redirects",
  "provider_result_unusable",
  "organic_depth_not_covered",
] as const;

export const ORGANIC_RESULT_UNCLASSIFIABLE = "organic_result_unclassifiable";

export type RankCheckFailureCode =
  | ProviderErrorCode
  | (typeof RANK_CHECK_ONLY_FAILURE_CODES)[number];

export type PresentedRankCheckFailureCode =
  | RankCheckFailureCode
  | typeof ORGANIC_RESULT_UNCLASSIFIABLE;

export function isRankCheckFailureCode(value: unknown): value is RankCheckFailureCode {
  return (
    (RANK_CHECK_ONLY_FAILURE_CODES as readonly unknown[]).includes(value) ||
    isProviderErrorCode(value)
  );
}

function errorHasAnomalyCode(error: string | null | undefined, code: string) {
  return error?.split(/[^a-z0-9_]+/).includes(code) ?? false;
}

export type ProviderFailurePresentation = {
  code: PresentedRankCheckFailureCode | null;
  message: string;
  showOpenIntegrations: boolean;
  showRetry: boolean;
};

const PRESENTATIONS: Record<ProviderErrorCode, Omit<ProviderFailurePresentation, "code">> = {
  provider_capacity_unavailable: {
    message:
      "Checks are temporarily unavailable for this provider. You were not charged. Try again later, or connect your own provider keys.",
    showOpenIntegrations: true,
    showRetry: true,
  },
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
  if (
    code === "organic_depth_not_covered" ||
    ((code == null || code === "provider_transient") &&
      errorHasAnomalyCode(error, "organic_depth_not_covered"))
  )
    return {
      code: "organic_depth_not_covered",
      message:
        "The returned organic results did not cover the requested depth, so no position or absence could be established.",
      showOpenIntegrations: false,
      showRetry: false,
    };
  // Older checks incorrectly stored account restrictions as billing failures.
  if (
    code === "provider_billing" &&
    /unusual activity|temporarily paused access/i.test(error ?? "")
  ) {
    return { code: "provider_account_restricted", ...PRESENTATIONS.provider_account_restricted };
  }
  if (code === "provider_unresolved_redirects")
    return {
      code,
      message: "The provider returned links we could not resolve, so this check has no position.",
      showOpenIntegrations: false,
      showRetry: false,
    };
  if (code === "provider_result_unusable")
    return {
      code,
      message:
        "The provider returned a result that could not be processed safely. Try again later.",
      showOpenIntegrations: false,
      showRetry: true,
    };
  if (
    code === ORGANIC_RESULT_UNCLASSIFIABLE ||
    (!isProviderErrorCode(code) && errorHasAnomalyCode(error, ORGANIC_RESULT_UNCLASSIFIABLE))
  ) {
    return {
      code: ORGANIC_RESULT_UNCLASSIFIABLE,
      message:
        "The provider returned a search result we could not classify, so this check has no position.",
      showOpenIntegrations: false,
      showRetry: false,
    };
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
