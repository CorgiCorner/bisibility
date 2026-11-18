import type { useTranslations } from "next-intl";

export type GooglePropertyFailureReason =
  | "auth"
  | "scope"
  | "permission"
  | "configuration"
  | "api_disabled"
  | "quota"
  | "temporary"
  | "unknown";
export type GooglePropertyFailure = {
  reason: GooglePropertyFailureReason;
  action:
    | "reconnect"
    | "reauthorize"
    | "check_permissions"
    | "configure_api"
    | "retry_later"
    | "retry";
  httpStatus?: number;
  code?: string;
};

type OauthTranslator = ReturnType<typeof useTranslations<"projectIntegrations.oauth">>;
type InsightsTranslator = ReturnType<typeof useTranslations<"projectSearchInsights.copy">>;

export function googlePropertyOauthFailureMessage(
  failure: GooglePropertyFailure,
  translate: OauthTranslator,
) {
  switch (failure.reason) {
    case "auth":
      return translate("googlePropertyAuth");
    case "scope":
      return translate("googlePropertyScope");
    case "permission":
      return translate("googlePropertyPermission");
    case "api_disabled":
    case "configuration":
      return translate("googlePropertyApiDisabled");
    case "quota":
      return translate("googlePropertyQuota");
    case "temporary":
      return translate("googlePropertyTemporary");
    case "unknown":
      return translate("googlePropertyUnknown");
    default: {
      const unreachable: never = failure.reason;
      return unreachable;
    }
  }
}

export function googlePropertyInsightsFailureMessage(
  failure: GooglePropertyFailure,
  translate: InsightsTranslator,
) {
  switch (failure.reason) {
    case "auth":
      return translate("googlePropertyAuth");
    case "scope":
      return translate("googlePropertyScope");
    case "permission":
      return translate("googlePropertyPermission");
    case "api_disabled":
    case "configuration":
      return translate("googlePropertyApiDisabled");
    case "quota":
      return translate("googlePropertyQuota");
    case "temporary":
      return translate("googlePropertyTemporary");
    case "unknown":
      return translate("googlePropertyUnknown");
    default: {
      const unreachable: never = failure.reason;
      return unreachable;
    }
  }
}
