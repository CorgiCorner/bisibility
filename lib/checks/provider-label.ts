import { rateForProvider } from "@/lib/cost-estimate/provider-rates";
import { PROVIDER_CATALOG } from "@/lib/providers/catalog-metadata";

export function providerLabel(provider: string) {
  const catalogProvider = PROVIDER_CATALOG.find((entry) => entry.id === provider);
  if (catalogProvider) return catalogProvider.label;
  const known = rateForProvider(provider);
  if (known) return known.label;
  return (
    provider
      .split(/[-_]/)
      .filter(Boolean)
      .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
      .join(" ") || "Unknown"
  );
}
