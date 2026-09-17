import type { ProviderFailureClass } from "@/lib/providers/failure-class";
import type { useTranslations } from "next-intl";

export function ga4DiscoveryFailure(
  failureClass: ProviderFailureClass,
  t: ReturnType<typeof useTranslations<"projectIntegrations.oauth">>,
) {
  switch (failureClass) {
    case "auth":
    case "provider_4xx":
      return t("ga4FailureAuth");
    case "config_invalid":
      return t("ga4FailureConfig");
    case "network":
    case "provider_5xx":
      return t("ga4FailureNetwork");
    case "rate_limit":
      return t("ga4FailureRateLimit");
    case "unknown":
      return t("ga4FailureUnknown");
  }
}
