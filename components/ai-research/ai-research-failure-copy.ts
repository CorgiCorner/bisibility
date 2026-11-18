import type { useTranslations } from "next-intl";

type ResearchTranslator = ReturnType<typeof useTranslations<"projectAiResearch">>;

export function failureMessage(reason: string, t: ResearchTranslator) {
  if (reason === "no_source") return t("noSource");
  if (reason === "pricing_unavailable") return t("pricingUnavailable");
  if (reason === "credentials_changed") return t("credentialsChanged");
  if (reason === "actual_cost_requires_own_credentials") return t("actualCostUnavailable");
  if (reason === "cost_limit_exceeded") return t("estimateAboveCap");
  if (reason.startsWith("unsupported_")) return t("unsupportedSettings");
  return t("requestFailure");
}
