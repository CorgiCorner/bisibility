import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { meteringNamespace } from "@/lib/metering/runtime";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import type { ConnectionPolicy } from "@usagekit/core";
import { decimalQuantity } from "@usagekit/providers";
import { loadNativeMeasuredPrice } from "./native-price-query";
import type { NativePriceBinding } from "./native-price-samples";
import { PROVIDER_RATE_FEATURES } from "./resolver";

export { nativeProviderCatalog } from "./catalog-source";

const manualOperations: Readonly<Record<string, readonly string[]>> = {
  rank_check: ["serp.google.organic.live.advanced", "serp.google.organic.task_post", "search"],
  keyword_research: [
    "dataforseo_labs.google.keyword_ideas.live",
    "dataforseo_labs.google.related_keywords.live",
    "dataforseo_labs.google.keyword_suggestions.live",
  ],
  keyword_metrics: ["dataforseo_labs.google.keyword_overview.live"],
  ranked_keywords: ["dataforseo_labs.google.ranked_keywords.live"],
};

/** The same read-only policy serves previews and admission; callers supply server-owned identity. */
export async function loadNativeCatalogPolicy(
  db: Pick<Prisma.TransactionClient, "providerConnection" | "$queryRaw">,
  binding: NativePriceBinding,
  feature: string,
  operation: string,
  options: Readonly<Record<string, string>>,
  now = new Date(),
): Promise<ConnectionPolicy> {
  if (binding.namespace !== meteringNamespace() || binding.fundingSource !== "byok")
    throw new Error("Provider pricing namespace or funding is unavailable");
  const connection = await db.providerConnection.findUnique({
    where: { id: binding.connectionId },
    select: {
      projectId: true,
      provider: true,
      credentialSource: true,
      credentialsEncrypted: true,
      enabled: true,
      status: true,
      project: { select: { ownerId: true } },
      rates: {
        where: { feature: { in: PROVIDER_RATE_FEATURES.filter((value) => value === feature) } },
        select: { amountCents: true },
      },
    },
  });
  if (
    !connection ||
    connection.projectId !== binding.projectId ||
    connection.project.ownerId !== binding.principal ||
    connection.provider !== binding.provider ||
    connection.credentialSource !== "own" ||
    !connection.enabled ||
    connection.status !== "connected" ||
    ownCredentialVersion(
      connection.provider,
      binding.connectionId,
      connection.credentialsEncrypted,
    ) !== binding.providerCredentialVersion
  )
    throw new Error("Provider pricing credential binding changed");
  const amount = manualOperations[feature]?.includes(operation)
    ? connection.rates[0]?.amountCents
    : undefined;
  const measured =
    amount === undefined && binding.provider !== "serpapi"
      ? await loadNativeMeasuredPrice(db, binding, operation, options, now)
      : undefined;
  return {
    provider: connection.provider,
    fundingSource: "byok",
    ...(amount === undefined
      ? { measured: (id: string) => (id === operation ? measured : undefined) }
      : {
          manualPrices: { [operation]: decimalQuantity(amount.toString(), "cents") },
          // Existing ranked-keyword overrides are per call, even when list prices use items.
          manualPriceBasis: {
            [operation]:
              feature === "keyword_metrics" || feature === "keyword_research" ? "item" : "call",
          },
        }),
  };
}
