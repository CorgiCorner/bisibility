import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import { rankCheckProviderSchema } from "./contract";

export function rankCheckProviderPresentation(selectionSpec: unknown) {
  if (typeof selectionSpec !== "object" || selectionSpec === null || Array.isArray(selectionSpec)) {
    return { provider: null, providerLabel: null };
  }

  const provider = rankCheckProviderSchema.safeParse(
    (selectionSpec as Record<string, unknown>).providerId,
  );
  if (!provider.success) return { provider: null, providerLabel: null };

  const catalogItem = PROVIDER_CATALOG.find(
    (candidate) => candidate.id === provider.data && candidate.kind === "serp",
  );
  return catalogItem
    ? { provider: provider.data, providerLabel: catalogItem.label }
    : { provider: null, providerLabel: null };
}
