import type { ConsentState } from "@/lib/analytics/consent";
import type { AnalyticsProvider } from "@/lib/analytics/provider";

export function AnalyticsRuntime(
  _props: Readonly<{ consent: ConsentState; provider: AnalyticsProvider; userId?: string }>,
) {
  return null;
}
