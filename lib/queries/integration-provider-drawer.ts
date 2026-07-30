import { providerAgeLabel } from "@/lib/integrations/provider-age";
import type { ProviderMetaRow, ProviderRateData } from "@/lib/integrations/types";
import {
  PROVIDER_RATE_LABELS,
  PROVIDER_RATE_UNITS,
  providerListRate,
  providerRateFeatures,
} from "@/lib/provider-rates/catalog";
import {
  type ProviderRateEntry,
  type ProviderRateFeature,
  type ResolvedProviderRate,
  resolveProviderRate,
} from "@/lib/provider-rates/resolver";
import { normalizeGscProperty } from "@/lib/providers/analytics/gsc-property";
import type { PROVIDER_CATALOG } from "@/lib/providers/registry";
import type { ProviderCredentials, ProviderKind } from "@/lib/providers/types";
import type { StatusKind } from "@/lib/ui/status-kind";

export type ProviderConnectionRow = {
  costPerCheckCents: unknown;
  credentialsEncrypted: string | null;
  enabled: boolean;
  id: string;
  kind: ProviderKind;
  lastUsedAt: Date | null;
  priority: number;
  provider: string;
  status: StatusKind;
  updatedAt: Date;
  rates?: readonly {
    amountCents: unknown;
    feature: ProviderRateFeature;
  }[];
};

export type ProviderCostEntryRow = ProviderRateEntry & {
  connectionId: string;
  feature: ProviderRateFeature;
};

export function providerDescription(item: (typeof PROVIDER_CATALOG)[number]) {
  if (item.id === "local-sequence") {
    return "Development-only deterministic ranks. Add [seq:5,15,15,4] to keyword text to stage transitions.";
  }
  return item.kind === "serp"
    ? `${item.label} rank-data provider. You pay the provider directly.`
    : `${item.label} connection for owned data enrichment.`;
}

export function providerMeta(
  item: (typeof PROVIDER_CATALOG)[number],
  connection: ProviderConnectionRow | undefined,
  credentials: ProviderCredentials,
  now: Date,
): ProviderMetaRow[] {
  let state = "Ready";
  if (connection) state = connection.enabled ? "Enabled" : "Disabled";

  if (item.kind === "analytics") {
    const identityLabel = item.id === "plausible" ? "Site domain" : "Property";
    return [
      { label: identityLabel, value: credentials.login ?? "Not selected" },
      ...(item.id === "plausible"
        ? [{ label: "API service", value: credentials.endpoint ?? "Plausible Cloud" }]
        : []),
      { label: "Last sync", value: providerAgeLabel(connection?.lastUsedAt, now) },
      { label: "State", value: state },
    ];
  }

  return [
    ...(credentials.login ? [{ label: "Account", value: credentials.login }] : []),
    {
      label: "Last rank check",
      value: providerAgeLabel(connection?.lastUsedAt, now),
    },
    {
      label: "State",
      value: state,
    },
  ];
}

export function providerActivities(
  kind: ProviderKind,
  connection: ProviderConnectionRow | undefined,
  now: Date,
): ProviderMetaRow[] {
  if (kind === "analytics") {
    return [
      { label: "Last sync", value: providerAgeLabel(connection?.lastUsedAt, now) },
      { label: "Connection updated", value: providerAgeLabel(connection?.updatedAt, now) },
      {
        label: "Connection state",
        value: connection ? (connection.enabled ? "Enabled" : "Disabled") : "Not connected",
      },
    ];
  }

  return [
    { label: "Last used", value: providerAgeLabel(connection?.lastUsedAt, now) },
    { label: "Connection updated", value: providerAgeLabel(connection?.updatedAt, now) },
    {
      label: "Fallback state",
      value: connection ? (connection.enabled ? "Enabled" : "Disabled") : "Not connected",
    },
  ];
}

function serializedRate(
  feature: ProviderRateFeature,
  resolved: ResolvedProviderRate,
  fallback: ResolvedProviderRate,
): ProviderRateData {
  return {
    ...("amountCents" in resolved ? { amountCents: resolved.amountCents } : {}),
    ...("checkedAt" in resolved ? { checkedAt: resolved.checkedAt.toISOString() } : {}),
    ...(resolved.source === "measured" ? { sampleSize: resolved.sampleSize } : {}),
    ...(fallback.source === "measured" || fallback.source === "list"
      ? { fallbackSource: fallback.source }
      : {}),
    feature,
    label: PROVIDER_RATE_LABELS[feature],
    source: resolved.source,
    unit: PROVIDER_RATE_UNITS[feature],
  };
}

export function providerRates(
  connection: ProviderConnectionRow | undefined,
  providerId: string,
  costEntries: readonly ProviderCostEntryRow[],
): ProviderRateData[] {
  return providerRateFeatures(providerId).map((feature) => {
    const manualRate = connection?.rates?.find((rate) => rate.feature === feature);
    const legacyRankRate =
      feature === "rank_check" && !manualRate ? connection?.costPerCheckCents : null;
    const entries = connection
      ? costEntries.filter(
          (entry) => entry.connectionId === connection.id && entry.feature === feature,
        )
      : [];
    const list = providerListRate(providerId, feature);
    const fallback = resolveProviderRate({ entries, list, manualAmountCents: null });
    const resolved = resolveProviderRate({
      entries,
      list,
      manualAmountCents: manualRate?.amountCents ?? legacyRankRate,
    });
    return serializedRate(feature, resolved, fallback);
  });
}

export function displayedProviderLogin(itemId: string, login: string | undefined) {
  return itemId === "gsc" && login ? normalizeGscProperty(login) : login;
}
