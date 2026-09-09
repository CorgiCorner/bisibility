export const ANALYTICS_CONTROL_IDS = [
  "getting_started.rank_provider",
  "onboarding.analytics_source",
  "onboarding.matching_root_www",
  "onboarding.matching_subdomains",
  "onboarding.matching_url_prefix",
  "onboarding.rank_provider",
  "onboarding.tracking_depth",
  "onboarding.tracking_devices",
  "onboarding.tracking_frequency",
] as const;

export type AnalyticsControlId = (typeof ANALYTICS_CONTROL_IDS)[number];
export type AnalyticsControlModule = "getting_started" | "onboarding";

export function analyticsControlModule(control: AnalyticsControlId): AnalyticsControlModule {
  return control.startsWith("getting_started.") ? "getting_started" : "onboarding";
}
