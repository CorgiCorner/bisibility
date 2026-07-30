import type { ProviderIconName } from "@/lib/integrations/types";
import type { ProviderKind } from "@/lib/providers/types";

const iconByProvider = {
  dataforseo: "database",
  ga4: "chart",
  gsc: "magnifier",
  plausible: "chart",
  serpapi: "globe",
} as const satisfies Record<string, ProviderIconName>;

export function providerIcon(providerId: string, kind: ProviderKind): ProviderIconName {
  return (
    iconByProvider[providerId as keyof typeof iconByProvider] ??
    (kind === "serp" ? "database" : "chart")
  );
}
