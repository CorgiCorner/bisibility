import "server-only";
import {
  PROVIDER_FEATURE_RATES,
  providerFeatureOperation,
} from "@/lib/cost-estimate/provider-feature-rates";
import type { Prisma } from "@/lib/generated/prisma/client";
import { meteringNamespace } from "@/lib/metering/runtime";
import { nativeProviderCatalog } from "@/lib/provider-rates/catalog-source";
import { nativeFeatureOptions } from "@/lib/provider-rates/native-feature-quote";
import type { NativePriceBinding } from "@/lib/provider-rates/native-price-samples";
import {
  loadNativeProviderQuote,
  ProviderQuoteUnavailableError,
} from "@/lib/provider-rates/native-quote";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { formatQuantity } from "@usagekit/core";
import type { ProviderRate } from "@usagekit/views";
import { connectionRates, unknownFigure } from "./rates";
import type { ProviderUiState, StoredUiConnection } from "./state";

type Variant = {
  id: string;
  feature: string;
  operation: string;
  label: string;
  options: Readonly<Record<string, string>>;
  unitsPerCheck?: number;
};

/** Reference requests are explicit; a row is a whole request, never a unit coefficient. */
function referenceVariants(provider: string): Variant[] {
  if (provider === "serpapi")
    return [1, 10].map((unitsPerCheck) => ({
      id: `request:rank_check:${unitsPerCheck * 10}`,
      feature: "rank_check",
      operation: "search",
      options: {},
      unitsPerCheck,
      label: `Rank check budget value (${unitsPerCheck * 10})`,
    }));
  if (provider !== "dataforseo") return [];
  const variants: Variant[] = [];
  for (const depth of [10, 100]) {
    const matched = nativeProviderCatalog.match(provider, {
      method: "POST",
      url: "/v3/serp/google/organic/live/advanced",
      body: [{ depth }],
    });
    if (matched.operation === "unknown") continue;
    variants.push({
      id: `request:rank_check:${depth}`,
      feature: "rank_check",
      operation: matched.operation.id,
      label: `${matched.operation.label} (${depth})`,
      options: matched.options,
    });
  }
  for (const rate of PROVIDER_FEATURE_RATES) {
    if (rate.providerId !== provider) continue;
    const single = ["domain_rank_overview", "backlinks_summary"].includes(rate.feature);
    const history = rate.feature.endsWith("history") || rate.feature === "historical_rank_overview";
    const count = single || history ? 1 : 100;
    const clickstreamVariants = rate.feature.startsWith("keyword_") ? [false, true] : [false];
    for (const clickstream of clickstreamVariants) {
      const options = nativeFeatureOptions(rate, count, clickstream);
      const operationId = providerFeatureOperation(rate);
      const descriptor = nativeProviderCatalog
        .operationsOf(provider)
        .find((entry) => entry.id === operationId);
      if (!descriptor) continue;
      const feature = rate.feature.startsWith("keyword_research_")
        ? "keyword_research"
        : rate.feature.startsWith("backlinks_")
          ? "backlinks"
          : ["domain_rank_overview", "historical_rank_overview", "relevant_pages"].includes(
                rate.feature,
              )
            ? "domain_overview"
            : rate.feature;
      variants.push({
        id: `request:${rate.feature}:${clickstream ? "clickstream" : "standard"}`,
        feature,
        operation: descriptor.id,
        label: `${descriptor.label}${history ? "" : ` (${count})`}${clickstream ? " + clickstream" : ""}`,
        options,
      });
    }
  }
  return variants;
}

const unknownQuote = (variant: Variant): ProviderRate => ({
  id: variant.id,
  label: variant.label,
  operation: variant.operation,
  unit: "request",
  priceUnit: "cents",
  price: unknownFigure("cents"),
  fundingSource: "byok",
  editable: false,
  provenance: {
    source: "unknown",
    origin: "unknown",
    checkedAt: null,
    sampleSize: null,
    version: null,
  },
});

export async function loadNativeProviderRates(
  db: Pick<Prisma.TransactionClient, "providerConnection" | "$queryRaw">,
  state: Pick<ProviderUiState, "project" | "binding">,
  connection: StoredUiConnection,
): Promise<ProviderRate[]> {
  const variants = referenceVariants(connection.provider);
  const coefficients = connectionRates(connection, state.binding.canManage === true);
  const unavailable = () => [...coefficients, ...variants.map(unknownQuote)];
  if (!variants.length || !connection.enabled || connection.status !== "connected")
    return unavailable();
  const stored = await db.providerConnection.findUnique({
    where: { id: connection.id },
    select: { credentialsEncrypted: true },
  });
  const version = ownCredentialVersion(
    connection.provider,
    connection.id,
    stored?.credentialsEncrypted,
  );
  if (!version) return unavailable();
  const binding: NativePriceBinding = {
    namespace: meteringNamespace(),
    principal: state.project.ownerId,
    projectId: state.project.id,
    connectionId: connection.id,
    provider: connection.provider,
    providerCredentialVersion: version,
    fundingSource: "byok",
  };
  const rows: ProviderRate[] = [];
  for (const variant of variants) {
    const row = unknownQuote(variant);
    try {
      const quote = await loadNativeProviderQuote(
        db,
        binding,
        variant.feature,
        variant.operation,
        variant.options,
        new Date(),
        variant.unitsPerCheck,
      );
      const amount = quote.quantities.find(
        (value) => value.unit === (quote.budgetValuation ? "budget_cents" : "cents"),
      );
      if (!amount) throw new ProviderQuoteUnavailableError();
      rows.push({
        ...row,
        price: {
          text: formatQuantity({
            ...amount,
            value: amount.value * BigInt(variant.unitsPerCheck ?? 1),
          }),
          unit: "cents",
          certainty: quote.source === "measured" ? "measured" : "estimated",
        },
        provenance: {
          source: quote.source,
          origin:
            quote.source === "manual" || quote.budgetValuation
              ? "host"
              : quote.source === "measured"
                ? "provider"
                : "catalog",
          checkedAt: quote.checkedAt ?? null,
          sampleSize: quote.sampleSize === undefined ? null : String(quote.sampleSize),
          version: quote.priceVersion ?? null,
        },
      });
    } catch (error) {
      if (!(error instanceof ProviderQuoteUnavailableError)) throw error;
      rows.push(row);
    }
  }
  return [...coefficients, ...rows];
}
