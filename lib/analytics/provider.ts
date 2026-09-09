export type AnalyticsProvider = "none" | "plausible" | "posthog";

type AnalyticsProviderEnv = Record<string, string | undefined>;

const configured = (value: string | undefined) => Boolean(value?.trim());

export function resolveAnalyticsProvider(env: AnalyticsProviderEnv): AnalyticsProvider {
  if (configured(env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN) && configured(env.NEXT_PUBLIC_PLAUSIBLE_URL)) {
    return "plausible";
  }
  return "none";
}

export function providerRequiresConsent(_provider: AnalyticsProvider): boolean {
  return false;
}
