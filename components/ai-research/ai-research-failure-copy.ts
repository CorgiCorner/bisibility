export function failureCopyKey(reason: string) {
  if (reason === "no_source") return "noSource";
  if (reason === "pricing_unavailable") return "pricingUnavailable";
  if (reason === "credentials_changed") return "credentialsChanged";
  if (reason === "actual_cost_requires_own_credentials") return "actualCostUnavailable";
  if (reason === "cost_limit_exceeded") return "estimateAboveCap";
  if (reason.startsWith("unsupported_")) return "unsupportedSettings";
  return "requestFailure";
}
